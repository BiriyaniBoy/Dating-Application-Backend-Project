import { Router } from "express";
import { uploadImage, uploadVideo } from "../controllers/auth.controller.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

// Routes definition (mounted at /api/v1)
router.route("/upload-image").post(upload.single("image"), uploadImage);
router.route("/upload-video").post(upload.single("video"), uploadVideo);

export default router;
