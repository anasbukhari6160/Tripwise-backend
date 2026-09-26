import express from "express";

import {
  deleteProfile,
  getProfile,
  updateProfile,
} from "../controllers/profile.controller.js";

const router = express.Router();

router.get("/", getProfile);
router.put("/", updateProfile);
router.delete("/", deleteProfile);

export default router;
