/* =========================================================
   TRIPWISE
   RECOVERY PLAN SERVICE

   Converts simulated resilience impacts into recovery
   suggestions.

   Important:
   - Does NOT modify the real trip.
   - Does NOT write to PostgreSQL.
   - Produces preview-only recovery actions.
========================================================= */

/* =========================================================
   RECOVERY ACTION TYPES
========================================================= */

export const RECOVERY_ACTION_TYPES = {
  ABSORB_DELAY: "ABSORB_DELAY",

  REDUCE_STOP_TIME: "REDUCE_STOP_TIME",

  SHIFT_NEXT_STOP: "SHIFT_NEXT_STOP",

  REDISTRIBUTE_TIME: "REDISTRIBUTE_TIME",

  SKIP_STOP: "SKIP_STOP",

  REPLACE_STOP: "REPLACE_STOP",

  REROUTE_TRIP: "REROUTE_TRIP",

  MANUAL_REVIEW: "MANUAL_REVIEW",
};

/* =========================================================
   VALIDATION
========================================================= */

function validateGraph(graph) {
  if (
    !graph ||
    typeof graph !== "object" ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges)
  ) {
    const error = new Error("A valid trip dependency graph is required.");

    error.code = "INVALID_DEPENDENCY_GRAPH";

    throw error;
  }
}

function validateScenarioResult(scenarioResult) {
  if (
    !scenarioResult ||
    typeof scenarioResult !== "object" ||
    !scenarioResult.type ||
    !Array.isArray(scenarioResult.impacts)
  ) {
    const error = new Error("A valid scenario simulation result is required.");

    error.code = "INVALID_SCENARIO_RESULT";

    throw error;
  }
}

/* =========================================================
   GRAPH HELPERS
========================================================= */

function findNode(graph, nodeId) {
  return graph.nodes.find((node) => String(node.id) === String(nodeId));
}

function findPreviousNode(graph, nodeId) {
  const edge = graph.edges.find((item) => String(item.to) === String(nodeId));

  if (!edge) {
    return null;
  }

  return findNode(graph, edge.from);
}

function findNextNode(graph, nodeId) {
  const edge = graph.edges.find((item) => String(item.from) === String(nodeId));

  if (!edge) {
    return null;
  }

  return findNode(graph, edge.to);
}

function findOutgoingEdge(graph, nodeId) {
  return graph.edges.find((edge) => String(edge.from) === String(nodeId));
}

/* =========================================================
   PRIORITY
========================================================= */

function severityToPriority(severity) {
  switch (severity) {
    case "high":
      return 1;

    case "moderate":
      return 2;

    case "low":
      return 3;

    default:
      return 4;
  }
}

/* =========================================================
   ACTION FACTORY
========================================================= */

function createAction({
  type,
  title,
  description,
  targetNodeId = null,
  relatedNodeId = null,
  estimatedHours = null,
  priority = 3,
  feasibility = "possible",
}) {
  return {
    type,

    title,

    description,

    targetNodeId,

    relatedNodeId,

    estimatedHours,

    priority,

    feasibility,
  };
}

/* =========================================================
   WEATHER RECOVERY
========================================================= */

function createWeatherRecovery(graph, scenarioResult) {
  const node = findNode(graph, scenarioResult.targetNodeId);

  if (!node) {
    return [];
  }

  const lostHours = Number(scenarioResult.metadata?.lostHours) || 0;

  const estimatedStayHours =
    node.stayDurationDays !== null ? node.stayDurationDays * 24 : null;

  const actions = [];

  /*
     If the destination has enough overall stay time,
     the disruption can potentially be absorbed by
     redistributing time within the same stop.
  */

  if (estimatedStayHours !== null && estimatedStayHours > lostHours) {
    actions.push(
      createAction({
        type: RECOVERY_ACTION_TYPES.REDISTRIBUTE_TIME,

        title: `Redistribute time in ${node.locationName}`,

        description: `Move flexible plans within the ${node.locationName} stay so the ${lostHours}-hour weather disruption can be absorbed without changing the destination sequence.`,

        targetNodeId: node.id,

        estimatedHours: lostHours,

        priority: 1,

        feasibility: "likely",
      }),
    );
  }

  actions.push(
    createAction({
      type: RECOVERY_ACTION_TYPES.REDUCE_STOP_TIME,

      title: `Reduce optional time in ${node.locationName}`,

      description: `Recover part of the lost time by shortening flexible or optional time at ${node.locationName}.`,

      targetNodeId: node.id,

      estimatedHours: lostHours,

      priority: 2,

      feasibility: "possible",
    }),
  );

  return actions;
}

/* =========================================================
   ARRIVAL DELAY RECOVERY
========================================================= */

function createArrivalDelayRecovery(graph, scenarioResult) {
  const node = findNode(graph, scenarioResult.targetNodeId);

  if (!node) {
    return [];
  }

  const delayHours = Number(scenarioResult.metadata?.delayHours) || 0;

  const outgoingEdge = findOutgoingEdge(graph, node.id);

  const nextNode = findNextNode(graph, node.id);

  const actions = [];

  /*
     No next destination means the delay cannot create
     a downstream trip-sequence conflict.
  */

  if (!outgoingEdge || !nextNode) {
    actions.push(
      createAction({
        type: RECOVERY_ACTION_TYPES.ABSORB_DELAY,

        title: `Absorb the delay in ${node.locationName}`,

        description: `The delayed arrival affects the current destination, but there is no following stop that needs to be protected.`,

        targetNodeId: node.id,

        estimatedHours: delayHours,

        priority: 1,

        feasibility: "likely",
      }),
    );

    return actions;
  }

  if (outgoingEdge.availableHours === null) {
    actions.push(
      createAction({
        type: RECOVERY_ACTION_TYPES.MANUAL_REVIEW,

        title: "Review the next transfer",

        description: `TripWise cannot calculate the transition buffer between ${node.locationName} and ${nextNode.locationName} because timing information is incomplete.`,

        targetNodeId: node.id,

        relatedNodeId: nextNode.id,

        priority: 1,

        feasibility: "review-required",
      }),
    );

    return actions;
  }

  const remainingHours = outgoingEdge.availableHours - delayHours;

  /*
     Enough time remains after the delay.
  */

  if (remainingHours > 3) {
    actions.push(
      createAction({
        type: RECOVERY_ACTION_TYPES.ABSORB_DELAY,

        title: "Absorb delay using trip buffer",

        description: `The delay can be absorbed while keeping the next stop at ${nextNode.locationName}. Approximately ${remainingHours} hours remain in the transition window.`,

        targetNodeId: node.id,

        relatedNodeId: nextNode.id,

        estimatedHours: delayHours,

        priority: 1,

        feasibility: "likely",
      }),
    );

    return actions;
  }

  /*
     Transition is still technically possible,
     but the buffer is very small.
  */

  if (remainingHours >= 0) {
    actions.push(
      createAction({
        type: RECOVERY_ACTION_TYPES.REDUCE_STOP_TIME,

        title: `Protect the transfer to ${nextNode.locationName}`,

        description: `The arrival delay leaves only ${remainingHours} hours before the next stop. Reduce flexible time at ${node.locationName} to preserve a safer transition window.`,

        targetNodeId: node.id,

        relatedNodeId: nextNode.id,

        estimatedHours: Math.min(delayHours, 3),

        priority: 1,

        feasibility: "possible",
      }),
    );

    actions.push(
      createAction({
        type: RECOVERY_ACTION_TYPES.SHIFT_NEXT_STOP,

        title: `Shift ${nextNode.locationName} later`,

        description: `Move the next stop later if its booking or schedule allows more transition time.`,

        targetNodeId: nextNode.id,

        relatedNodeId: node.id,

        estimatedHours: Math.max(1, 3 - remainingHours),

        priority: 2,

        feasibility: "conditional",
      }),
    );

    return actions;
  }

  /*
     Negative remaining time means the delay creates
     an actual schedule conflict.
  */

  const conflictHours = Math.abs(remainingHours);

  actions.push(
    createAction({
      type: RECOVERY_ACTION_TYPES.SHIFT_NEXT_STOP,

      title: `Delay ${nextNode.locationName}`,

      description: `The simulated delay creates an overlap of approximately ${conflictHours} hours. Shift the next destination later to remove the conflict.`,

      targetNodeId: nextNode.id,

      relatedNodeId: node.id,

      estimatedHours: conflictHours,

      priority: 1,

      feasibility: "conditional",
    }),
  );

  actions.push(
    createAction({
      type: RECOVERY_ACTION_TYPES.REDUCE_STOP_TIME,

      title: `Shorten the stay in ${node.locationName}`,

      description: `Reduce time at ${node.locationName} by approximately ${conflictHours} hours if the next destination cannot be moved.`,

      targetNodeId: node.id,

      relatedNodeId: nextNode.id,

      estimatedHours: conflictHours,

      priority: 2,

      feasibility: "possible",
    }),
  );

  return actions;
}

/* =========================================================
   UNAVAILABLE STOP RECOVERY
========================================================= */

function createUnavailableStopRecovery(graph, scenarioResult) {
  const node = findNode(graph, scenarioResult.targetNodeId);

  if (!node) {
    return [];
  }

  const previousNode = findPreviousNode(graph, node.id);

  const nextNode = findNextNode(graph, node.id);

  const actions = [];

  actions.push(
    createAction({
      type: RECOVERY_ACTION_TYPES.REPLACE_STOP,

      title: `Replace ${node.locationName}`,

      description: `Choose another destination or activity for the same part of the itinerary while keeping the surrounding trip structure intact.`,

      targetNodeId: node.id,

      priority: 1,

      feasibility: "conditional",
    }),
  );

  actions.push(
    createAction({
      type: RECOVERY_ACTION_TYPES.SKIP_STOP,

      title: `Skip ${node.locationName}`,

      description: `Remove the unavailable stop from the recovery preview and redistribute its available time across the remaining trip.`,

      targetNodeId: node.id,

      priority: 2,

      feasibility: "possible",
    }),
  );

  /*
     If the unavailable stop sits between two destinations,
     TripWise can suggest connecting those destinations
     directly.
  */

  if (previousNode && nextNode) {
    actions.push(
      createAction({
        type: RECOVERY_ACTION_TYPES.REROUTE_TRIP,

        title: `Reroute from ${previousNode.locationName} to ${nextNode.locationName}`,

        description: `Bypass ${node.locationName} and connect the surrounding destinations directly. Travel time should be recalculated before applying this change.`,

        targetNodeId: node.id,

        relatedNodeId: nextNode.id,

        priority: 3,

        feasibility: "review-required",
      }),
    );
  }

  return actions;
}

/* =========================================================
   REDUCED TIME RECOVERY
========================================================= */

function createReducedTimeRecovery(graph, scenarioResult) {
  const node = findNode(graph, scenarioResult.targetNodeId);

  if (!node) {
    return [];
  }

  const lostHours = Number(scenarioResult.metadata?.lostHours) || 0;

  const remainingHours = scenarioResult.metadata?.remainingHours;

  const actions = [];

  if (typeof remainingHours === "number" && remainingHours > 0) {
    actions.push(
      createAction({
        type: RECOVERY_ACTION_TYPES.REDISTRIBUTE_TIME,

        title: `Compress the ${node.locationName} schedule`,

        description: `The stop still has approximately ${remainingHours} hours available. Reorganize flexible plans within that remaining time.`,

        targetNodeId: node.id,

        estimatedHours: lostHours,

        priority: 1,

        feasibility: "likely",
      }),
    );

    actions.push(
      createAction({
        type: RECOVERY_ACTION_TYPES.REDUCE_STOP_TIME,

        title: "Remove lower-priority time",

        description: `Reduce optional time at ${node.locationName} by up to ${lostHours} hours to protect the rest of the itinerary.`,

        targetNodeId: node.id,

        estimatedHours: lostHours,

        priority: 2,

        feasibility: "possible",
      }),
    );

    return actions;
  }

  actions.push(
    createAction({
      type: RECOVERY_ACTION_TYPES.MANUAL_REVIEW,

      title: `Rework the ${node.locationName} stop`,

      description: `The simulated time reduction leaves insufficient usable time at ${node.locationName}. The stop may need to be shifted, shortened significantly, or removed.`,

      targetNodeId: node.id,

      estimatedHours: lostHours,

      priority: 1,

      feasibility: "review-required",
    }),
  );

  return actions;
}

/* =========================================================
   SCENARIO RECOVERY ROUTER
========================================================= */

function createRecoveryActions(graph, scenarioResult) {
  switch (scenarioResult.type) {
    case "WEATHER_DISRUPTION":
      return createWeatherRecovery(graph, scenarioResult);

    case "ARRIVAL_DELAY":
      return createArrivalDelayRecovery(graph, scenarioResult);

    case "ACTIVITY_UNAVAILABLE":
      return createUnavailableStopRecovery(graph, scenarioResult);

    case "REDUCED_DAY_TIME":
      return createReducedTimeRecovery(graph, scenarioResult);

    default:
      return [
        createAction({
          type: RECOVERY_ACTION_TYPES.MANUAL_REVIEW,

          title: "Review disruption manually",

          description:
            "TripWise does not currently have an automatic recovery strategy for this disruption type.",

          priority: 1,

          feasibility: "review-required",
        }),
      ];
  }
}

/* =========================================================
   PUBLIC RECOVERY PLAN
========================================================= */

export function generateRecoveryPlan(graph, scenarioResult) {
  validateGraph(graph);

  validateScenarioResult(scenarioResult);

  const actions = createRecoveryActions(graph, scenarioResult).sort(
    (first, second) => first.priority - second.priority,
  );

  const highestPriority = severityToPriority(scenarioResult.severity);

  return {
    scenarioId: scenarioResult.scenarioId,

    scenarioType: scenarioResult.type,

    targetNodeId: scenarioResult.targetNodeId,

    severity: scenarioResult.severity,

    recoveryAvailable: actions.length > 0,

    recommendedAction: actions[0] || null,

    actions,

    summary: {
      actionCount: actions.length,

      priority: highestPriority,

      requiresReview: actions.some(
        (action) => action.feasibility === "review-required",
      ),

      automaticChangesApplied: false,
    },

    generatedAt: new Date().toISOString(),
  };
}

/* =========================================================
   MULTIPLE RECOVERY PLANS
========================================================= */

export function generateRecoveryPlans(graph, scenarioResults = []) {
  validateGraph(graph);

  if (!Array.isArray(scenarioResults)) {
    const error = new Error("Scenario results must be provided as an array.");

    error.code = "INVALID_SCENARIO_RESULTS";

    throw error;
  }

  return scenarioResults.map((scenarioResult) =>
    generateRecoveryPlan(graph, scenarioResult),
  );
}
