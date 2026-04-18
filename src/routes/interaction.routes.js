import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { interactWithUserProfile } from "../controllers/interaction.controller.js";

const router = Router();

router.use(verifyJWT);

// Route for accepting/rejecting a profile
// POST /api/v1/interactions/:targetUserId
// Body: { "action": "accept" } or { "action": "reject" }
router.route("/:targetUserId").post(interactWithUserProfile);

export default router;
