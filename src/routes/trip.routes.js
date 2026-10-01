import express from "express";

import {
  createTripHandler,
  deleteTripHandler,
  getTrip,
  getTrips,
  updateTripHandler,
} from "../controllers/trip.controller.js";

import {
  applyTripRecovery,
  stressTestTrip,
} from "../controllers/resilience.controller.js";

import { requirePro } from "../middleware/requirePro.js";

const router = express.Router();

router.use(requirePro);

router.get("/", getTrips);

router.post("/", createTripHandler);

router.post("/:tripId/stress-test", stressTestTrip);

router.post("/:tripId/recovery/apply", applyTripRecovery);

router.get("/:tripId", getTrip);

router.put("/:tripId", updateTripHandler);

router.delete("/:tripId", deleteTripHandler);

export default router;
