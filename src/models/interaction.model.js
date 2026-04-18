import mongoose, { Schema } from "mongoose";

const interactionSchema = new Schema(
  {
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    target: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    action: {
      type: String,
      enum: ["accept", "reject"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure that a user can only perform one active interaction towards a specific target.
// E.g., they can't both accept and reject a user simultaneously, only update.
interactionSchema.index({ actor: 1, target: 1 }, { unique: true });

export const Interaction = mongoose.model("Interaction", interactionSchema);
