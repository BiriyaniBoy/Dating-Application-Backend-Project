import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    getUserProfile,
    getAllUserProfiles,
    updateUserProfile,
    getAcceptedProfiles,
    getRejectedProfiles,
    deletePhoto,
    getNearbyMatches
} from "../controllers/user.controller.js";

const router = Router();

// Apply JWT verification to all routes below
router.use(verifyJWT);

// Route to get all active user profiles
router.route("/profiles").get(getAllUserProfiles);

// Route to get nearby matches based on distancePreference (Industrial Approach)
router.route("/nearby-matches").get(getNearbyMatches);

// Route to get all accepted users
router.route("/accepted").get(getAcceptedProfiles);

// Route to get all rejected users
router.route("/rejected").get(getRejectedProfiles);

// Route to update own profile using PUT (Full Replacement)
router.route("/edit-profile").put(updateUserProfile);

// Route to get a specific user's profile and comments
router.route("/:userId/profile").get(getUserProfile);

// Route to delete a photo from the current user's profile (also removes from Cloudinary)
// Body: { "photoUrl": "https://res.cloudinary.com/..." }
router.route("/photo/delete").delete(deletePhoto);

export default router;
