import express from "express";

import { searchDestinations } from "../controllers/location.controller.js";
import { requirePro } from "../middleware/requirePro.js";

const router = express.Router();

router.use(requirePro);

router.get("/search", searchDestinations);

export default router;
