import { removeTripStop } from "./trip.service.js";

export const RECOVERY_APPLICATION_MODES = {
  NO_CHANGE_NEEDED: "NO_CHANGE_NEEDED",

  CAN_APPLY: "CAN_APPLY",

  REQUIRES_USER_EDIT: "REQUIRES_USER_EDIT",

  NOT_APPLICABLE: "NOT_APPLICABLE",
};

function createRecoveryError(message, code, status = 400) {
  const error = new Error(message);

  error.code = code;

  error.status = status;

  return error;
}

/* =========================================================
   CLASSIFY RECOVERY ACTION
========================================================= */

export function classifyRecoveryAction(action) {
  if (!action || typeof action !== "object") {
    return {
      canApply: false,

      mode: RECOVERY_APPLICATION_MODES.NOT_APPLICABLE,

      reason: "Invalid recovery action.",
    };
  }

  switch (action.type) {
    case "ABSORB_DELAY":
      return {
        canApply: false,

        mode: RECOVERY_APPLICATION_MODES.NO_CHANGE_NEEDED,

        reason:
          "The trip can absorb this disruption without changing the saved itinerary.",
      };

    case "REDISTRIBUTE_TIME":
      return {
        canApply: false,

        mode: RECOVERY_APPLICATION_MODES.NO_CHANGE_NEEDED,

        reason: "This recovery does not require a saved itinerary change.",
      };

    case "SKIP_STOP":
      return {
        canApply: true,

        mode: RECOVERY_APPLICATION_MODES.CAN_APPLY,

        reason:
          "TripWise can remove this destination from the saved itinerary.",
      };

    case "REPLACE_STOP":
      return {
        canApply: false,

        mode: RECOVERY_APPLICATION_MODES.REQUIRES_USER_EDIT,

        reason:
          "Choose a replacement destination before applying this recovery.",
      };

    case "REDUCE_STOP_TIME":
      return {
        canApply: false,

        mode: RECOVERY_APPLICATION_MODES.REQUIRES_USER_EDIT,

        reason:
          "The current itinerary stores calendar dates rather than hour-level times.",
      };

    case "SHIFT_NEXT_STOP":
      return {
        canApply: false,

        mode: RECOVERY_APPLICATION_MODES.REQUIRES_USER_EDIT,

        reason:
          "The current itinerary cannot safely persist hour-level schedule shifts.",
      };

    case "REROUTE_TRIP":
      return {
        canApply: false,

        mode: RECOVERY_APPLICATION_MODES.REQUIRES_USER_EDIT,

        reason:
          "Rerouting requires additional itinerary decisions before saving.",
      };

    case "MANUAL_REVIEW":
      return {
        canApply: false,

        mode: RECOVERY_APPLICATION_MODES.NOT_APPLICABLE,

        reason: "This recovery requires manual review.",
      };

    default:
      return {
        canApply: false,

        mode: RECOVERY_APPLICATION_MODES.NOT_APPLICABLE,

        reason:
          "This recovery action cannot currently be applied automatically.",
      };
  }
}

/* =========================================================
   ATTACH APPLICATION METADATA
========================================================= */

export function attachApplicationMetadata(recoveryPlan) {
  if (!recoveryPlan || typeof recoveryPlan !== "object") {
    return recoveryPlan;
  }

  const actions = Array.isArray(recoveryPlan.actions)
    ? recoveryPlan.actions.map((action) => ({
        ...action,

        application: classifyRecoveryAction(action),
      }))
    : [];

  const recommendedAction = recoveryPlan.recommendedAction
    ? {
        ...recoveryPlan.recommendedAction,

        application: classifyRecoveryAction(recoveryPlan.recommendedAction),
      }
    : null;

  return {
    ...recoveryPlan,

    recommendedAction,

    actions,
  };
}

export function attachApplicationMetadataToPlans(recoveryPlans = []) {
  if (!Array.isArray(recoveryPlans)) {
    return [];
  }

  return recoveryPlans.map(attachApplicationMetadata);
}

/* =========================================================
   APPLY RECOVERY
========================================================= */

export async function applyRecoveryAction({ userId, tripId, action }) {
  if (!action || typeof action !== "object") {
    throw createRecoveryError(
      "A recovery action is required.",
      "INVALID_RECOVERY_ACTION",
    );
  }

  const classification = classifyRecoveryAction(action);

  if (!classification.canApply) {
    throw createRecoveryError(classification.reason, "RECOVERY_NOT_APPLICABLE");
  }

  /*
   * Only SKIP_STOP is currently supported.
   */

  if (action.type !== "SKIP_STOP") {
    throw createRecoveryError(
      "This recovery action is not currently supported.",
      "UNSUPPORTED_RECOVERY_ACTION",
    );
  }

  const stopId = Number(action.targetNodeId);

  if (!Number.isInteger(stopId) || stopId <= 0) {
    throw createRecoveryError(
      "A valid destination ID is required.",
      "INVALID_TARGET_STOP",
    );
  }

  const result = await removeTripStop(userId, tripId, stopId);

  if (result.reason === "TRIP_NOT_FOUND") {
    throw createRecoveryError("Trip not found.", "TRIP_NOT_FOUND", 404);
  }

  if (result.reason === "STOP_NOT_FOUND") {
    throw createRecoveryError(
      "The selected destination could not be found in this trip.",
      "STOP_NOT_FOUND",
      404,
    );
  }

  if (result.reason === "LAST_STOP") {
    throw createRecoveryError(
      "The final destination cannot be removed from a trip.",
      "LAST_STOP_CANNOT_BE_REMOVED",
    );
  }

  return {
    action: {
      type: "SKIP_STOP",

      targetNodeId: String(stopId),
    },

    removedStopId: result.removedStopId,

    trip: result.trip,
  };
}
