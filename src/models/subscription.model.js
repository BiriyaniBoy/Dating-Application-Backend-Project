import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        plan: {
            type: String,
            enum: ["gold", "platinum"],
            required: true,
        },
        basePrice: {
            type: Number,
            required: true,
        },
        discountApplied: {
            type: Boolean,
            default: false,
        },
        finalPrice: {
            type: Number,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ["active", "cancelled"],
            default: "active",
        },
    },
    { timestamps: true }
);

export const Subscription = mongoose.model("Subscription", subscriptionSchema);
