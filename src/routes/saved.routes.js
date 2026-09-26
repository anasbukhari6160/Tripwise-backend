import express from "express";

import {
  deleteSavedDestination,
  getSavedDestinations,
  saveDestination,
} from "../controllers/saved.controller.js";

const router = express.Router();

router.get("/", getSavedDestinations);
router.post("/", saveDestination);
router.delete("/:id", deleteSavedDestination);

export default router;
