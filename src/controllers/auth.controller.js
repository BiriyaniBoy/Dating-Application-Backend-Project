import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinaryUtils.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Something went wrong while generating refresh and access token");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    gender,
    interestedIn,
    photos,
    universityName,
    latitude,
    longitude,
    passions,
    fitnessLevel,
    drinks,
    smokingHabits,
    verificationImage,
    age,
    profession,
    minAge,
    maxAge,
    distancePreference,
  } = req.body;

  if ([name, email, password].some((field) => String(field).trim() === "")) {
    throw new ApiError(400, "Name, email and password are required");
  }

  const VALID_GENDERS = ["male", "female", "others"];
  if (!gender || !VALID_GENDERS.includes(gender.toLowerCase())) {
    throw new ApiError(400, "Gender is required. Choose: male, female, or others");
  }
  if (!interestedIn || !VALID_GENDERS.includes(interestedIn.toLowerCase())) {
    throw new ApiError(400, "Interested gender is required. Choose: male, female, or others");
  }

  const existedUser = await User.findOne({ email });

  if (existedUser) {
    throw new ApiError(409, "User with email already exists");
  }

  const user = await User.create({
    name,
    email,
    password,
    gender: gender.toLowerCase(),
    interestedIn: interestedIn.toLowerCase(),
    photos,
    universityName,
    latitude,
    longitude,
    passions,
    fitnessLevel,
    drinks,
    smokingHabits,
    verificationImage,
    age,
    profession,
    agePreference: {
      minAge: minAge || 18,
      maxAge: maxAge || 100
    },
    distancePreference: distancePreference || 20,
    latitude: Number(latitude),
    longitude: Number(longitude),
    location: {
      type: "Point",
      coordinates: [Number(longitude), Number(latitude)]
    }
  });

  const createdUser = await User.findById(user._id).select("-password -refreshToken");

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(createdUser._id);

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(201)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: createdUser,
          tokens: { accessToken, refreshToken }
        },
        "User registered successfully"
      )
    );
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          tokens: {
            accessToken,
            refreshToken
          }
        },
        "User logged In Successfully"
      )
    );
});

const uploadImage = asyncHandler(async (req, res) => {
  console.log("📸 uploadImage controller started");
  console.log("📸 Request File:", req.file ? "Present" : "Missing");
  console.log("📸 Request Body contains image:", req.body?.image ? "Yes (Base64)" : "No");

  let imagePath = req.file?.path;

  // If file is missing but base64 is present in body
  if (!imagePath && req.body.image) {
    console.log("✨ Received Base64 image, using direct Cloudinary upload...");
    imagePath = req.body.image; // Cloudinary supports base64 strings directly
  }

  if (!imagePath) {
    console.log("❌ No image data found in request");
    throw new ApiError(400, "Image data is missing (expected file or base64)");
  }

  console.log("☁️ Uploading to Cloudinary...");
  const uploadedImage = await uploadOnCloudinary(imagePath);

  if (!uploadedImage) {
    console.log("❌ Cloudinary upload returned null");
    throw new ApiError(500, "Error while uploading image to Cloudinary");
  }

  console.log("✅ Cloudinary upload success:", uploadedImage.url);
  return res
    .status(200)
    .json(
      new ApiResponse(200, { url: uploadedImage.url }, "Image uploaded successfully")
    );
});

const uploadVideo = asyncHandler(async (req, res) => {
  const videoLocalPath = req.file?.path;

  if (!videoLocalPath) {
    throw new ApiError(400, "Video file is missing");
  }

  const uploadedVideo = await uploadOnCloudinary(videoLocalPath);

  if (!uploadedVideo) {
    throw new ApiError(500, "Error while uploading video to Cloudinary");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { url: uploadedVideo.url }, "Video uploaded successfully")
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // this removes the field from document
      },
    },
    {
      returnDocument: "after",
    }
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.body.refreshToken || req.cookies?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const getMyProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  const userData = user.toObject ? user.toObject() : user;

  // Dynamically compute subscription status
  const isSubscription = userData.subscriptionExpiry
    ? new Date(userData.subscriptionExpiry) > new Date()
    : false;

  const profileData = {
    ...userData,
    isSubscription,
    subscriptionType: isSubscription ? userData.subscriptionType : "none",
    gender: userData.gender,
    interestedIn: userData.interestedIn,
    age: userData.age,
    profession: userData.profession,
    agePreference: userData.agePreference,
    distancePreference: userData.distancePreference,
    latitude: userData.latitude,
    longitude: userData.longitude
  };

  // Remove sensitive fields
  delete profileData.password;
  delete profileData.refreshToken;

  return res
    .status(200)
    .json(new ApiResponse(200, profileData, "User profile fetched successfully"));
});

export { registerUser, loginUser, uploadImage, uploadVideo, logoutUser, refreshAccessToken, getMyProfile };
