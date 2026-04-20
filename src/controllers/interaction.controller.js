import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Interaction } from "../models/interaction.model.js";

const interactWithUserProfile = asyncHandler(async (req, res) => {
    const actorId = req.user._id;
    const { targetUserId } = req.params;
    const { action } = req.body; 

    if (!action || !["accept", "reject"].includes(action)) {
        throw new ApiError(400, "Invalid action. Must be 'accept' or 'reject'");
    }

    if (actorId.toString() === targetUserId) {
        throw new ApiError(400, "You cannot interact with your own profile");
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
        throw new ApiError(404, "Target user not found");
    }

    // Upsert the interaction. If they previously rejected and now accepted (or vice versa), it will just update.
    const interaction = await Interaction.findOneAndUpdate(
        { actor: actorId, target: targetUserId },
        { action },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    // Optional: check if there's a mutual 'accept' (a match) to return status back
    let isMatch = false;
    if (action === "accept") {
        const reverseInteraction = await Interaction.findOne({ 
            actor: targetUserId, 
            target: actorId, 
            action: "accept" 
        });
        if (reverseInteraction) {
            isMatch = true;
            // You can implement Match logic here, e.g., create an entry in a Conversation or Match schema
        }
    }

    return res.status(200).json(
        new ApiResponse(
            200, 
            { interaction, isMatch }, 
            `Profile ${action}ed successfully`
        )
    );
});

export { interactWithUserProfile };
