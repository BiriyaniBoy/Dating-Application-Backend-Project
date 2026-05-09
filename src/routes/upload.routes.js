import { Router } from "express";
import { 
    uploadImage, 
    uploadVideo, 
    uploadVoice, 
    deleteImage, 
    deleteVideo, 
    deleteVoice 
} from "../controllers/auth.controller.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

// Routes definition (mounted at /api/v1)
router.route("/upload-image")
    .get((req, res) => res.status(200).json({ message: "Upload route is REACHABLE via GET" }))
    .post(upload.single("image"), uploadImage);

router.route("/upload-video").post(upload.single("video"), uploadVideo);
router.route("/upload-voice").post(upload.single("voice"), uploadVoice);

router.route("/delete-image").delete(deleteImage);
router.route("/delete-video").delete(deleteVideo);
router.route("/delete-voice").delete(deleteVoice);

export default router;
