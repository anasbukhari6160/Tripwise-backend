import express from "express";

import {
  createCheckout,
  verifyCheckoutSession,
  cancelSubscription,
  reactivateSubscription,
} from "../controllers/payment.controller.js";

const router = express.Router();

router.post("/create-checkout-session", createCheckout);

router.get("/verify-session", verifyCheckoutSession);

router.post("/cancel-subscription", cancelSubscription);
router.post("/reactivate-subscription", reactivateSubscription);

export default router;
