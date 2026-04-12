import { Router } from "express";
import { registerUser, loginUser, uploadImage, uploadVideo, logoutUser, refreshAccessToken } from "../controllers/auth.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/refresh-token").post(refreshAccessToken);

// Secure routes (Require authentication for file uploads)
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/upload-image").post(verifyJWT, upload.single("image"), uploadImage);
router.route("/upload-video").post(verifyJWT, upload.single("video"), uploadVideo);

export default router;
