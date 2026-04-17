import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    addComment,
    editComment,
    deleteComment,
    reactToComment,
    removeReaction
} from "../controllers/commet.controllers.js";

const router = Router();

router.use(verifyJWT); // Secure all comment routes

router.post("/add-comment", addComment);
router.put("/:commentId", editComment);
router.delete("/:commentId", deleteComment);
router.post("/:commentId/reaction", reactToComment);
router.delete("/:commentId/reaction", removeReaction);

export default router;
