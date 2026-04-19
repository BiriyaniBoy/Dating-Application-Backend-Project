import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Subscription } from "../models/subscription.model.js";

const STATIC_PLANS = [
    { id: "plan_gold", name: "Gold", price: 100, durationDays: 7 },
    { id: "plan_platinum", name: "Platinum", price: 200, durationDays: 7 }
];

const STATIC_DISCOUNTS = [
    { id: "disc_10", name: "10% Off", percentage: 10 },
    { id: "disc_20", name: "20% Off", percentage: 20 }
];

const getPlansAndDiscounts = asyncHandler(async (req, res) => {
    return res.status(200).json(new ApiResponse(200, {
        plans: STATIC_PLANS,
        discounts: STATIC_DISCOUNTS
    }, "Plans and discounts fetched successfully."));
});

const subscribe = asyncHandler(async (req, res) => {
    const { planId, discountId } = req.body;
    const userId = req.user._id;

    if (!planId) {
        throw new ApiError(400, "planId is required.");
    }

    const selectedPlan = STATIC_PLANS.find(p => p.id === planId);
    if (!selectedPlan) {
        throw new ApiError(400, "Invalid planId. Please choose a valid plan.");
    }

    const basePrice = selectedPlan.price;
    let finalPrice = basePrice;
    let discountApplied = false;

    // Apply optional discount if provided
    if (discountId) {
        const selectedDiscount = STATIC_DISCOUNTS.find(d => d.id === discountId);
        if (!selectedDiscount) {
            throw new ApiError(400, "Invalid discountId provided.");
        }
        finalPrice = basePrice - (basePrice * (selectedDiscount.percentage / 100));
        discountApplied = true;
    }

    const durationMs = selectedPlan.durationDays * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + durationMs);
    const schemaPlanName = selectedPlan.name.toLowerCase();

    // Track the transaction in the history schema
    const subscription = await Subscription.create({
        user: userId,
        plan: schemaPlanName,
        basePrice,
        discountApplied,
        finalPrice,
        expiresAt
    });

    // Authorize & Update underlying user account
    await User.findByIdAndUpdate(userId, {
        subscriptionType: schemaPlanName,
        subscriptionExpiry: expiresAt
    });

    return res.status(200).json(
        new ApiResponse(200, {
            subscription,
            basePrice,
            discountApplied,
            finalPrice,
            expiresAt,
            message: `Successfully subscribed to ${schemaPlanName} plan for ${selectedPlan.durationDays} days.`
        }, "Subscription successful")
    );
});

const cancelSubscription = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { planId } = req.params;

    // Check if what they passed actually maps to our active static plans
    const selectedPlan = STATIC_PLANS.find(p => p.id === planId);
    if (!selectedPlan) {
        throw new ApiError(400, "Invalid planId. Must be 'plan_gold' or 'plan_platinum'.");
    }

    const schemaPlanName = selectedPlan.name.toLowerCase();

    // Fetch the exact subscription transaction using the native plan string ("gold", "platinum")
    const subscriptionRecord = await Subscription.findOne({
        plan: schemaPlanName,
        user: userId,
        status: "active"
    });

    if (!subscriptionRecord) {
        throw new ApiError(404, "Active subscription plan not found or already cancelled.");
    }

    // Set this specific history line to 'cancelled' and immediately expire it
    subscriptionRecord.status = "cancelled";
    subscriptionRecord.expiresAt = new Date();
    await subscriptionRecord.save();

    // Now, confirm if this exact plan was the one supplying privileges to the underlying User account
    const user = await User.findById(userId);
    if (user.subscriptionType === subscriptionRecord.plan) {
        // Sever the active privileges immediately
        await User.findByIdAndUpdate(userId, {
            subscriptionType: "none",
            subscriptionExpiry: null
        });
    }

    return res.status(200).json(
        new ApiResponse(200, { cancelledPlan: subscriptionRecord.plan }, "Subscription plan cancelled successfully. You no longer have active plan benefits.")
    );
});

export { getPlansAndDiscounts, subscribe, cancelSubscription };
