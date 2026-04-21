import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    role: {
      type: String,
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    refreshToken: {
      type: String,
    },
    gender: {
      type: String,
      enum: ["male", "female", "others"],
      required: [true, "Gender is required"],
    },
    interestedIn: {
      type: String,
      enum: ["male", "female", "others"],
      required: [true, "Interested gender is required"],
    },
    age: {
      type: Number,
      required: [true, "Age is required"],
      min: [18, "Must be at least 18 years old"]
    },
    profession: {
      type: String
    },
    agePreference: {
      minAge: {
        type: Number,
        default: 18
      },
      maxAge: {
        type: Number,
        default: 100
      }
    },
    photos: {
      type: [String],
      validate: {
        validator: function (v) {
          return v == null || (v.length >= 4 && v.length <= 9);
        },
        message: "Photos must be between 4 and 9.",
      },
    },
    universityName: {
      type: String,
    },
    latitude: {
      type: String,
    },
    longitude: {
      type: String,
    },
    passions: {
      type: [String],
    },
    fitnessLevel: {
      type: String,
    },
    drinks: {
      type: String,
    },
    smokingHabits: {
      type: String,
    },
    verificationImage: {
      type: String,
    },
    subscriptionType: {
      type: String,
      enum: ["none", "gold", "platinum"],
      default: "none",
    },
    subscriptionExpiry: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast matchmaking queries
userSchema.index({ gender: 1, age: 1 });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      role: this.role,
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

export const User = mongoose.model("User", userSchema);
