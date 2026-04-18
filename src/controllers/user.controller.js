import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import { CommentReaction } from "../models/comment.reaction.model.js";

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
        user,
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

    return res.status(200).json(
        new ApiResponse(200, users, "All user profiles fetched successfully")
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
        new ApiResponse(200, updatedUser, "User profile updated successfully via PUT")
    );
});

export { getUserProfile, getAllUserProfiles, updateUserProfile };
