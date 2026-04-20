import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import { CommentReaction } from "../models/comment.reaction.model.js";
import { Interaction } from "../models/interaction.model.js";
import { deleteFromCloudinary } from "../utils/cloudinaryUtils.js";

const mapSubscriptionStatus = (user) => {
    if (!user) return user;
    const isSubscription = user.subscriptionExpiry ? (new Date(user.subscriptionExpiry) > new Date()) : false;
    const _user = user.toObject ? user.toObject() : user;
    return {
        ..._user,
        isSubscription,
        subscriptionType: isSubscription ? _user.subscriptionType : "none"
    };
};

const getUserProfile = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // Fetch the user
    const user = await User.findById(userId).select("-password -refreshToken").lean();
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Fetch all active comments for this user profile
    const comments = await Comment.find({ targetUser: userId, isDeleted: false })
        .populate("author", "name photos")
        .sort({ createdAt: 1 }) // sort ascending to push oldest to top or descending? Let's keep general order
        .lean();

    // Fetch reactions by the current logged in user for these comments
    const commentIds = comments.map(c => c._id);
    const reactions = await CommentReaction.find({
        comment: { $in: commentIds },
        user: req.user._id
    }).lean();

    // Map reactions for O(1) lookup
    const reactionMap = {};
    reactions.forEach(r => {
        reactionMap[r.comment.toString()] = r.type;
    });

    // Decorate comments with metadata and prepare a lookup dictionary
    const commentsMap = {};
    const rootComments = [];

    comments.forEach(comment => {
        // Assign isLiked and isDisliked properties
        comment.isLiked = reactionMap[comment._id.toString()] === "like";
        comment.isDisliked = reactionMap[comment._id.toString()] === "dislike";
        comment.replies = [];

        commentsMap[comment._id.toString()] = comment;
    });

    // Build the nested structure
    comments.forEach(comment => {
        if (comment.parentComment) {
            const parentId = comment.parentComment.toString();
            if (commentsMap[parentId]) {
                commentsMap[parentId].replies.push(comment);
            } else {
                // Orphaned child (parent deleted), treat as root or display normally
                rootComments.push(comment);
            }
        } else {
            rootComments.push(comment);
        }
    });

    return res.status(200).json(new ApiResponse(200, {
        user: mapSubscriptionStatus(user),
        comments: rootComments
    }, "User profile and comments fetched successfully"));
});

const getAllUserProfiles = asyncHandler(async (req, res) => {
    // 1. Get the current user ID from req.user
    const currentUserId = req.user._id;

    // 2. Add the $ne filter to the query
    const users = await User.find({
        isActive: true,
        _id: { $ne: currentUserId } // This excludes "me" from the list
    })
        .select("-password -refreshToken")
        .sort({ createdAt: -1 })
        .lean();

    // 3. Get interactions for the mapping
    const interactions = await Interaction.find({ actor: currentUserId }).lean();
    const interactionMap = {};
    interactions.forEach(i => {
        interactionMap[i.target.toString()] = i.action;
    });

    // 4. Attach status to each user
    const usersWithStatus = users.map(user => {
        const action = interactionMap[user._id.toString()];
        const subDecorated = mapSubscriptionStatus(user);
        return {
            ...subDecorated,
            interactionStatus: action || null,
            isAccepted: action === "accept",
            isRejected: action === "reject"
        };
    });

    return res.status(200).json(
        new ApiResponse(200, usersWithStatus, "All user profiles fetched successfully")
    );
});

const updateUserProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // In a strict PUT, you might not filter fields, 
    // but for security, we keep the allowed list.
    const allowedUpdates = [
        "name", "photos", "universityName", "latitude", "longitude",
        "passions", "fitnessLevel", "drinks", "smokingHabits", "verificationImage"
    ];

    const updates = {};

    // Logic: Map the allowed fields. 
    // If a field is missing in req.body, you might want to set it to null/empty 
    // depending on how strict you want the PUT to be.
    allowedUpdates.forEach((key) => {
        if (req.body[key] !== undefined) {
            updates[key] = req.body[key];
        }
    });

    if (Object.keys(updates).length === 0) {
        throw new ApiError(400, "No fields provided for update");
    }

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updates }, // Replaces the specific fields provided
        {
            new: true,
            runValidators: true,
            overwrite: false // Set to true only if you want to wipe the whole document (dangerous!)
        }
    ).select("-password -refreshToken");

    if (!updatedUser) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(200, mapSubscriptionStatus(updatedUser), "User profile updated successfully via PUT")
    );
});

const getAcceptedProfiles = asyncHandler(async (req, res) => {
    const currentUserId = req.user._id;

    const acceptedInteractions = await Interaction.find({ actor: currentUserId, action: "accept" }).lean();
    const acceptedTargetIds = acceptedInteractions.map(i => i.target);

    const acceptedUsers = await User.find({
        _id: { $in: acceptedTargetIds },
        isActive: true
    }).select("-password -refreshToken").lean();

    return res.status(200).json(
        new ApiResponse(200, acceptedUsers.map(mapSubscriptionStatus), "Accepted user profiles fetched successfully")
    );
});

const getRejectedProfiles = asyncHandler(async (req, res) => {
    const currentUserId = req.user._id;

    const rejectedInteractions = await Interaction.find({ actor: currentUserId, action: "reject" }).lean();
    const rejectedTargetIds = rejectedInteractions.map(i => i.target);

    const rejectedUsers = await User.find({
        _id: { $in: rejectedTargetIds },
        isActive: true
    }).select("-password -refreshToken").lean();

    return res.status(200).json(
        new ApiResponse(200, rejectedUsers.map(mapSubscriptionStatus), "Rejected user profiles fetched successfully")
    );
});

const deletePhoto = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { photoUrl } = req.body;

    if (!photoUrl) {
        throw new ApiError(400, "photoUrl is required in the request body.");
    }

    // Fetch the user and their current photos
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found.");

    const currentPhotos = user.photos || [];

    // Check the photo actually belongs to this user
    if (!currentPhotos.includes(photoUrl)) {
        throw new ApiError(404, "Photo not found in your profile.");
    }

    // Enforce minimum: must keep at least 4 photos after deletion
    if (currentPhotos.length <= 4) {
        throw new ApiError(400, "Cannot delete photo. You must have a minimum of 4 photos at all times.");
    }

    // Delete the image from Cloudinary first
    const cloudinaryResult = await deleteFromCloudinary(photoUrl);
    if (!cloudinaryResult || cloudinaryResult.result !== "ok") {
        throw new ApiError(500, "Failed to delete image from Cloudinary. Please try again.");
    }

    // Remove the photo from the user's photos array in DB
    const updatedPhotos = currentPhotos.filter(p => p !== photoUrl);
    user.photos = updatedPhotos;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(200, { photos: user.photos }, "Photo deleted successfully.")
    );
});

export { 
    getUserProfile, 
    getAllUserProfiles, 
    updateUserProfile,
    getAcceptedProfiles,
    getRejectedProfiles,
    deletePhoto
};
