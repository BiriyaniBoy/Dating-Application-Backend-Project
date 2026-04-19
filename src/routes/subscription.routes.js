import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getPlansAndDiscounts, subscribe, cancelSubscription } from "../controllers/subscription.controller.js";

const router = Router();
router.use(verifyJWT);

// Returns all configured plans & discounts
router.route("/plans").get(getPlansAndDiscounts);

// Subscribes current user to a plan
router.route("/subscribe").post(subscribe);

// Cancels a specific subscription transaction using its Plan/Subscription ID
router.route("/cancel/:planId").post(cancelSubscription);

export default router;
