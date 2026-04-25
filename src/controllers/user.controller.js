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
    const currentUserId = req.user._id;
    const currentUser = req.user;

    // 1. Identify users we've already interacted with (so we don't show them again in feed)
    // - Always exclude profiles we accepted.
    // - Only exclude profiles we rejected if the rejection was within the last 1 month.
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const myInteractions = await Interaction.find({ 
        actor: currentUserId,
        $or: [
            { action: "accept" },
            { action: "reject", updatedAt: { $gte: oneMonthAgo } }
        ]
    }).distinct("target");

    // 2. Identify users who accepted the current user (excluding those we already interacted with)
    const acceptedMeIds = await Interaction.find({ 
        target: currentUserId, 
        action: "accept",
        actor: { $nin: myInteractions } 
    }).distinct("actor");

    // 3. Build Normal Query
    const interestedIn = currentUser?.interestedIn?.toLowerCase();
    const normalQuery = {
        isActive: true,
        _id: { $ne: currentUserId, $nin: [...myInteractions, ...acceptedMeIds] }
    };

    if (interestedIn === "male" || interestedIn === "female") {
        normalQuery.gender = interestedIn;
    } else {
        normalQuery.gender = { $in: ["male", "female", "others"] };
    }

    const minAge = currentUser?.agePreference?.minAge || 18;
    const maxAge = currentUser?.agePreference?.maxAge || 100;
    normalQuery.age = { $gte: minAge, $lte: maxAge };

    if (currentUser.latitude && currentUser.longitude) {
        const distanceKm = currentUser.distancePreference || 20;
        const radiusInRadians = distanceKm / 6378.1; 
        normalQuery.location = {
            $geoWithin: {
                $centerSphere: [
                    [Number(currentUser.longitude), Number(currentUser.latitude)], 
                    radiusInRadians
                ]
            }
        };
    }

    // 4. Pagination Math for "Fill Up" mix (Pattern: Normal, Normal, Accepted...)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalNormal = await User.countDocuments(normalQuery);
    const totalAccepted = acceptedMeIds.length;

    const getIdealAccepted = (n) => Math.floor(n / 3);
    const getActualAcceptedConsumed = (n) => Math.min(totalAccepted, getIdealAccepted(n));
    const getActualNormalConsumed = (n) => Math.min(totalNormal, n - getActualAcceptedConsumed(n));

    const skipAccepted = getActualAcceptedConsumed(skip);
    const limitAccepted = getActualAcceptedConsumed(skip + limit) - skipAccepted;

    const skipNormal = getActualNormalConsumed(skip);
    const limitNormal = getActualNormalConsumed(skip + limit) - skipNormal;

    // 5. Fetch Data
    const acceptedUsersPromise = limitAccepted > 0 
        ? User.find({ _id: { $in: acceptedMeIds }, isActive: true })
            .select("-password -refreshToken").sort({ createdAt: -1 }).skip(skipAccepted).limit(limitAccepted).lean()
        : Promise.resolve([]);

    const normalUsersPromise = limitNormal > 0
        ? User.find(normalQuery)
            .select("-password -refreshToken").sort({ createdAt: -1 }).skip(skipNormal).limit(limitNormal).lean()
        : Promise.resolve([]);

    const [acceptedUsers, normalUsers] = await Promise.all([acceptedUsersPromise, normalUsersPromise]);

    // 6. Interleave perfectly according to "Fill Up" rules
    const mixedProfiles = [];
    let normalIndex = 0;
    let acceptedIndex = 0;

    for (let i = skip; i < skip + limit; i++) {
        if (normalIndex >= normalUsers.length && acceptedIndex >= acceptedUsers.length) break;

        const isIdealAccepted = (i % 3 === 2); // 3rd index means i=2, i=5, i=8 (0-indexed)
        
        if (isIdealAccepted) {
            if (acceptedIndex < acceptedUsers.length) {
                mixedProfiles.push({ ...acceptedUsers[acceptedIndex++], isAcceptedMe: true });
            } else if (normalIndex < normalUsers.length) {
                mixedProfiles.push(normalUsers[normalIndex++]);
            }
        } else {
            if (normalIndex < normalUsers.length) {
                mixedProfiles.push(normalUsers[normalIndex++]);
            } else if (acceptedIndex < acceptedUsers.length) {
                mixedProfiles.push({ ...acceptedUsers[acceptedIndex++], isAcceptedMe: true });
            }
        }
    }

    // Attach formatting
    const usersWithStatus = mixedProfiles.map(user => {
        const subDecorated = mapSubscriptionStatus(user);
        return {
            ...subDecorated,
            interactionStatus: null, // Always null in feed because we excluded 'myInteractions'
            isAccepted: false,
            isRejected: false
        };
    });

    return res.status(200).json(
        new ApiResponse(200, usersWithStatus, "Mixed user profiles fetched successfully")
    );
});

const updateUserProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // In a strict PUT, you might not filter fields, 
    // but for security, we keep the allowed list.
    const allowedUpdates = [
        "name", "photos", "universityName", "latitude", "longitude",
        "passions", "fitnessLevel", "drinks", "smokingHabits", "verificationImage",
        "gender", "interestedIn", "age", "profession", "agePreference", "distancePreference"
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

    // Sync GeoJSON location if lat/long are updated
    if (updates.latitude !== undefined || updates.longitude !== undefined) {
        const lat = updates.latitude !== undefined ? Number(updates.latitude) : req.user.latitude;
        const lng = updates.longitude !== undefined ? Number(updates.longitude) : req.user.longitude;
        
        if (!isNaN(lat) && !isNaN(lng)) {
            updates.location = {
                type: "Point",
                coordinates: [lng, lat]
            };
        }
    }

    if (Object.keys(updates).length === 0) {
        throw new ApiError(400, "No fields provided for update");
    }

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updates }, // Replaces the specific fields provided
        {
            returnDocument: "after",
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

const getWhoAcceptedMe = asyncHandler(async (req, res) => {
    const currentUserId = req.user._id;

    const interactions = await Interaction.find({ target: currentUserId, action: "accept" }).lean();
    const actorIds = interactions.map(i => i.actor);

    const users = await User.find({
        _id: { $in: actorIds },
        isActive: true
    }).select("-password -refreshToken").lean();

    return res.status(200).json(
        new ApiResponse(200, {
            count: users.length,
            users: users.map(mapSubscriptionStatus)
        }, "Users who accepted your profile fetched successfully")
    );
});

const getWhoRejectedMe = asyncHandler(async (req, res) => {
    const currentUserId = req.user._id;

    const interactions = await Interaction.find({ target: currentUserId, action: "reject" }).lean();
    const actorIds = interactions.map(i => i.actor);

    const users = await User.find({
        _id: { $in: actorIds },
        isActive: true
    }).select("-password -refreshToken").lean();

    return res.status(200).json(
        new ApiResponse(200, {
            count: users.length,
            users: users.map(mapSubscriptionStatus)
        }, "Users who rejected your profile fetched successfully")
    );
});

const getMatches = asyncHandler(async (req, res) => {
    const currentUserId = req.user._id;

    // 1. Get users I have accepted
    const myLikes = await Interaction.find({ actor: currentUserId, action: "accept" }).distinct("target");

    // 2. Among those users, find who has accepted me
    const mutualLikes = await Interaction.find({ 
        actor: { $in: myLikes }, 
        target: currentUserId, 
        action: "accept" 
    }).distinct("actor");

    // 3. Fetch user profiles
    const matches = await User.find({
        _id: { $in: mutualLikes },
        isActive: true
    }).select("-password -refreshToken").lean();

    return res.status(200).json(
        new ApiResponse(200, matches.map(mapSubscriptionStatus), "Matches fetched successfully")
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

const getNearbyMatches = asyncHandler(async (req, res) => {
    const user = req.user;
    
    if (!user.latitude || !user.longitude) {
        throw new ApiError(400, "Location data missing. Please update your profile with latitude and longitude.");
    }

    const interestedIn = user.interestedIn?.toLowerCase();
    const minAge = user.agePreference?.minAge || 18;
    const maxAge = user.agePreference?.maxAge || 100;

    // Prioritize dynamic distance query param, fallback to profile preference
    const requestedDistance = parseInt(req.query.distance);
    let distanceKm = user.distancePreference || 20;

    if (!isNaN(requestedDistance)) {
        if (requestedDistance < 5 || requestedDistance > 150) {
            throw new ApiError(400, "Requested distance must be between 5km and 150km");
        }
        distanceKm = requestedDistance;
    }

    // Convert km to radians for $centerSphere
    const radiusInRadians = distanceKm / 6378.1;

    const query = {
        isActive: true,
        _id: { $ne: user._id },
        age: { $gte: minAge, $lte: maxAge },
        location: {
            $geoWithin: {
                $centerSphere: [
                    [Number(user.longitude), Number(user.latitude)], 
                    radiusInRadians
                ]
            }
        }
    };

    if (interestedIn === "male" || interestedIn === "female") {
        query.gender = interestedIn;
    } else {
        query.gender = { $in: ["male", "female", "others"] };
    }

    const matches = await User.find(query)
        .select("name photos _id") // Lean response: name, photos, and ID only
        .limit(100) // Return top 100 results for fast response
        .lean();

    return res.status(200).json(
        new ApiResponse(200, matches, "Nearby matches fetched successfully (No pagination)")
    );
});

export { 
    getUserProfile, 
    getAllUserProfiles, 
    updateUserProfile,
    getAcceptedProfiles,
    getRejectedProfiles,
    getWhoAcceptedMe,
    getWhoRejectedMe,
    getMatches,
    deletePhoto,
    getNearbyMatches
};
