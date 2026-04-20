import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Comment } from "../models/comment.model.js";
import { CommentReaction } from "../models/comment.reaction.model.js";

// Add a comment or reply
const addComment = asyncHandler(async (req, res) => {
    const { targetUserId, content, parentCommentId } = req.body;
    const author = req.user._id;

    if (!targetUserId || !content) {
        throw new ApiError(400, "Target User ID and content are required");
    }

    let depth = 0;
    if (parentCommentId) {
        const parent = await Comment.findById(parentCommentId);
        if (!parent) {
            throw new ApiError(404, "Parent comment not found");
        }
        depth = parent.depth + 1;
        parent.repliesCount += 1;
        await parent.save();
    }

    const comment = await Comment.create({
        author,
        targetUser: targetUserId,
        content,
        parentComment: parentCommentId || null,
        depth
    });

    return res.status(201).json(new ApiResponse(201, comment, "Comment added successfully"));
});

// Edit a comment
const editComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!content) {
        throw new ApiError(400, "Content is required");
    }

    const comment = await Comment.findById(commentId);
    if (!comment) throw new ApiError(404, "Comment not found");
    if (comment.isDeleted) throw new ApiError(400, "Cannot edit a deleted comment");

    if (comment.author.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only edit your own comments");
    }

    comment.content = content;
    await comment.save();

    return res.status(200).json(new ApiResponse(200, comment, "Comment updated successfully"));
});

// Delete a comment (Soft delete)
const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);
    if (!comment) throw new ApiError(404, "Comment not found");

    if (comment.author.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only delete your own comments");
    }

    comment.isDeleted = true;
    await comment.save();

    return res.status(200).json(new ApiResponse(200, null, "Comment deleted successfully"));
});

// React to a comment (Like/Dislike)
const reactToComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const { type } = req.body; // 'like' | 'dislike'

    if (!["like", "dislike"].includes(type)) {
        throw new ApiError(400, "Invalid reaction type, must be 'like' or 'dislike'");
    }

    const comment = await Comment.findById(commentId);
    if (!comment || comment.isDeleted) {
        throw new ApiError(404, "Comment not found or deleted");
    }

    // Upsert the reaction
    const reaction = await CommentReaction.findOneAndUpdate(
        { user: req.user._id, comment: commentId },
        { type },
        { returnDocument: "after", upsert: true }
    );

    return res.status(200).json(new ApiResponse(200, reaction, `Comment ${type}d successfully`));
});

// Remove reaction
const removeReaction = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    await CommentReaction.findOneAndDelete({ user: req.user._id, comment: commentId });

    return res.status(200).json(new ApiResponse(200, null, "Reaction removed successfully"));
});

export { addComment, editComment, deleteComment, reactToComment, removeReaction };
