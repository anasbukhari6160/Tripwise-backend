import { getTripById } from "../services/trip.service.js";

import { runTripStressTest } from "../services/resilience.service.js";

import { applyRecoveryAction } from "../services/recoveryApplication.service.js";

function validTripId(value) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0;
}

/* =========================================================
   STRESS TEST
========================================================= */

export async function stressTestTrip(req, res) {
  try {
    const tripId = Number(req.params.tripId);

    if (!validTripId(tripId)) {
      return res.status(400).json({
        success: false,

        message: "Invalid trip ID.",

        code: "INVALID_TRIP_ID",
      });
    }

    const { scenarios } = req.body;

    if (!Array.isArray(scenarios)) {
      return res.status(400).json({
        success: false,

        message: "Scenarios must be provided as an array.",

        code: "INVALID_SCENARIOS",
      });
    }

    if (scenarios.length === 0) {
      return res.status(400).json({
        success: false,

        message: "At least one stress-test scenario is required.",

        code: "EMPTY_SCENARIOS",
      });
    }

    if (scenarios.length > 10) {
      return res.status(400).json({
        success: false,

        message:
          "A maximum of 10 stress-test scenarios can be evaluated at once.",

        code: "TOO_MANY_SCENARIOS",
      });
    }

    const trip = await getTripById(req.userId, tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,

        message: "Trip not found.",

        code: "TRIP_NOT_FOUND",
      });
    }

    if (!Array.isArray(trip.stops) || trip.stops.length === 0) {
      return res.status(400).json({
        success: false,

        message: "This trip does not contain any destinations to stress-test.",

        code: "TRIP_HAS_NO_STOPS",
      });
    }

    const report = runTripStressTest(trip, scenarios);

    return res.status(200).json(report);
  } catch (error) {
    console.error("Trip resilience stress-test error:", error);

    return res.status(error.status || 500).json({
      success: false,

      message: error.message || "Unable to stress-test this trip.",

      code: error.code || "RESILIENCE_TEST_FAILED",
    });
  }
}

/* =========================================================
   APPLY RECOVERY
========================================================= */

export async function applyTripRecovery(req, res) {
  try {
    const tripId = Number(req.params.tripId);

    if (!validTripId(tripId)) {
      return res.status(400).json({
        success: false,

        message: "Invalid trip ID.",

        code: "INVALID_TRIP_ID",
      });
    }

    const { confirmed, action } = req.body || {};

    /*
     * Explicit approval is mandatory.
     */

    if (confirmed !== true) {
      return res.status(400).json({
        success: false,

        message: "Recovery application requires explicit confirmation.",

        code: "CONFIRMATION_REQUIRED",
      });
    }

    const result = await applyRecoveryAction({
      userId: req.userId,

      tripId,

      action,
    });

    return res.status(200).json({
      success: true,

      message: "Recovery applied successfully.",

      appliedAction: result.action,

      removedStopId: result.removedStopId,

      trip: result.trip,
    });
  } catch (error) {
    console.error("Apply trip recovery error:", error);

    return res.status(error.status || 500).json({
      success: false,

      message: error.message || "Unable to apply this recovery.",

      code: error.code || "RECOVERY_APPLICATION_FAILED",
    });
  }
}
