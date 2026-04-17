import mongoose, { Schema } from "mongoose";

const commentSchema = new Schema(
    {
        // Who wrote the comment
        author: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // On whose profile the comment is made
        targetUser: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // Parent comment (for nesting)
        parentComment: {
            type: Schema.Types.ObjectId,
            ref: "Comment",
            default: null,
            index: true,
        },

        // Actual content
        content: {
            type: String,
            required: true,
            trim: true,
        },

        // Optional: depth control (helps prevent infinite nesting issues)
        depth: {
            type: Number,
            default: 0,
        },

        // Optional: track replies count (for optimization)
        repliesCount: {
            type: Number,
            default: 0,
        },

        // Soft delete (important in social apps)
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

export const Comment = mongoose.model("Comment", commentSchema);