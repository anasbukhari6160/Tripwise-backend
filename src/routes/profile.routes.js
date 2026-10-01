import express from "express";

import {
  deleteProfile,
  getProfile,
  requestPasswordChange,
  updateProfile,
  verifyPasswordChange,
} from "../controllers/profile.controller.js";

const router = express.Router();

router.get("/", getProfile);

router.put("/", updateProfile);

router.post("/password/request-change", requestPasswordChange);

router.post("/password/verify-change", verifyPasswordChange);

router.delete("/", deleteProfile);

export default router;
