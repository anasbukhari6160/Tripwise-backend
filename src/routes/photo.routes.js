import express from "express";

import { getDestinationPhotos } from "../controllers/photo.controller.js";

import { requirePro } from "../middleware/requirePro.js";

const router = express.Router();

router.use(requirePro);

router.get("/destination", getDestinationPhotos);

export default router;
