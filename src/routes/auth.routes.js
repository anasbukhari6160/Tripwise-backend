import express from "express";

import {
  getCurrentUser,
  login,
  logout,
  register,
  verifyEmail,
  resendVerificationCode,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationCode);
router.post("/login", login);
router.get("/me", getCurrentUser);
router.post("/logout", logout);

export default router;
