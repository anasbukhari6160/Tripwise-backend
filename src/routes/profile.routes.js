import express from "express";

import {
  deleteProfile,
  getProfile,
  requestPasswordChange,
  updateProfile,
  verifyPasswordChange,
} from "../controllers/profile.controller.js";

const router = express.Router();

/* =========================================================
   PROFILE
========================================================= */

router.get("/", getProfile);

router.put("/", updateProfile);

/* =========================================================
   PASSWORD
========================================================= */

router.post("/password/request-change", requestPasswordChange);

router.post("/password/verify-change", verifyPasswordChange);

/* =========================================================
   DELETE ACCOUNT
========================================================= */

router.delete("/", deleteProfile);

export default router;
