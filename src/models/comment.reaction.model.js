import mongoose, { Schema } from "mongoose";

const commentReactionSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        comment: {
            type: Schema.Types.ObjectId,
            ref: "Comment",
            required: true,
            index: true,
        },

        // "like" or "dislike"
        type: {
            type: String,
            enum: ["like", "dislike"],
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// 🔥 Ensure ONE reaction per user per comment
commentReactionSchema.index(
    { user: 1, comment: 1 },
    { unique: true }
);

// Useful for aggregations
commentReactionSchema.index({ comment: 1, type: 1 });

export const CommentReaction = mongoose.model(
    "CommentReaction",
    commentReactionSchema
);