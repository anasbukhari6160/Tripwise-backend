import express from "express";

import {
  createTripHandler,
  deleteTripHandler,
  getTrip,
  getTrips,
  updateTripHandler,
} from "../controllers/trip.controller.js";

import { requirePro } from "../middleware/requirePro.js";

const router = express.Router();

router.use(requirePro);

router.get("/", getTrips);

router.get("/:tripId", getTrip);

router.post("/", createTripHandler);

router.put("/:tripId", updateTripHandler);

router.delete("/:tripId", deleteTripHandler);

export default router;
