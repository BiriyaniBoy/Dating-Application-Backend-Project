import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getUserProfile } from "../controllers/user.controller.js";

const router = Router();

router.use(verifyJWT);

router.route("/:userId/profile").get(getUserProfile);

export default router;
