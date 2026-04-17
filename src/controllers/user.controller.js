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

export { getUserProfile };
