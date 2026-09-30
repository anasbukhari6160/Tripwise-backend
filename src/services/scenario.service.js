/* =========================================================
   TRIPWISE
   RESILIENCE SCENARIO SERVICE

   Simulates disruptions against a trip dependency graph.

   Important:
   - Does NOT modify the original trip.
   - Does NOT modify the dependency graph.
   - Produces deterministic impact data.
========================================================= */

/* =========================================================
   SCENARIO TYPES
========================================================= */

export const SCENARIO_TYPES = {
  WEATHER_DISRUPTION: "WEATHER_DISRUPTION",

  ARRIVAL_DELAY: "ARRIVAL_DELAY",

  ACTIVITY_UNAVAILABLE: "ACTIVITY_UNAVAILABLE",

  REDUCED_DAY_TIME: "REDUCED_DAY_TIME",
};

/* =========================================================
   VALIDATION HELPERS
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

function validateScenario(scenario) {
  if (!scenario || typeof scenario !== "object") {
    const error = new Error("A valid resilience scenario is required.");

    error.code = "INVALID_SCENARIO";

    throw error;
  }

  if (!Object.values(SCENARIO_TYPES).includes(scenario.type)) {
    const error = new Error("Unsupported resilience scenario type.");

    error.code = "UNSUPPORTED_SCENARIO";

    throw error;
  }
}

/* =========================================================
   GRAPH HELPERS
========================================================= */

function findNode(graph, nodeId) {
  return graph.nodes.find((node) => String(node.id) === String(nodeId));
}

function findIncomingEdge(graph, nodeId) {
  return graph.edges.find((edge) => String(edge.to) === String(nodeId));
}

function findOutgoingEdge(graph, nodeId) {
  return graph.edges.find((edge) => String(edge.from) === String(nodeId));
}

function requireTargetNode(graph, targetNodeId) {
  if (!targetNodeId) {
    const error = new Error("A target stop is required for this scenario.");

    error.code = "TARGET_NODE_REQUIRED";

    throw error;
  }

  const node = findNode(graph, targetNodeId);

  if (!node) {
    const error = new Error("The selected trip stop could not be found.");

    error.code = "TARGET_NODE_NOT_FOUND";

    throw error;
  }

  return node;
}

/* =========================================================
   NUMBER HELPERS
========================================================= */

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }

  return number;
}

/* =========================================================
   SEVERITY HELPERS
========================================================= */

function getWeatherSeverity(lostHours) {
  if (lostHours >= 12) {
    return "high";
  }

  if (lostHours >= 6) {
    return "moderate";
  }

  return "low";
}

function getDelaySeverity(delayHours) {
  if (delayHours >= 12) {
    return "high";
  }

  if (delayHours >= 4) {
    return "moderate";
  }

  return "low";
}

function getReducedTimeSeverity(lostHours) {
  if (lostHours >= 8) {
    return "high";
  }

  if (lostHours >= 4) {
    return "moderate";
  }

  return "low";
}

/* =========================================================
   WEATHER DISRUPTION
========================================================= */

function simulateWeatherDisruption(graph, scenario) {
  const node = requireTargetNode(graph, scenario.targetNodeId);

  const lostHours = normalizePositiveNumber(scenario.lostHours, 6);

  const severity = scenario.severity || getWeatherSeverity(lostHours);

  return {
    type: SCENARIO_TYPES.WEATHER_DISRUPTION,

    targetNodeId: node.id,

    severity,

    impacts: [
      {
        nodeId: node.id,

        impactType: "destination-time-loss",

        severity,

        lostHours,

        message: `${lostHours} hours of planned time may be lost at ${node.locationName} because of weather disruption.`,
      },
    ],

    metadata: {
      locationName: node.locationName,

      lostHours,
    },
  };
}

/* =========================================================
   ARRIVAL DELAY
========================================================= */

function simulateArrivalDelay(graph, scenario) {
  const node = requireTargetNode(graph, scenario.targetNodeId);

  const delayHours = normalizePositiveNumber(scenario.delayHours, 3);

  const incomingEdge = findIncomingEdge(graph, node.id);

  const outgoingEdge = findOutgoingEdge(graph, node.id);

  const severity = getDelaySeverity(delayHours);

  const impacts = [
    {
      nodeId: node.id,

      impactType: "arrival-delay",

      severity,

      delayHours,

      message: `Arrival at ${node.locationName} is delayed by ${delayHours} hours.`,
    },
  ];

  /*
     If this stop has an outgoing dependency,
     the delay can reduce the available transition
     window before the next destination.
  */

  if (outgoingEdge && outgoingEdge.availableHours !== null) {
    const remainingHours = outgoingEdge.availableHours - delayHours;

    let edgeSeverity = "low";

    if (remainingHours < 0) {
      edgeSeverity = "high";
    } else if (remainingHours <= 3) {
      edgeSeverity = "moderate";
    }

    impacts.push({
      edgeId: outgoingEdge.id,

      from: outgoingEdge.from,

      to: outgoingEdge.to,

      impactType: "reduced-transition-window",

      severity: edgeSeverity,

      originalAvailableHours: outgoingEdge.availableHours,

      remainingAvailableHours: remainingHours,

      message:
        remainingHours < 0
          ? "The arrival delay creates a conflict with the next destination."
          : `The transition window before the next destination is reduced to ${remainingHours} hours.`,
    });
  }

  return {
    type: SCENARIO_TYPES.ARRIVAL_DELAY,

    targetNodeId: node.id,

    severity,

    impacts,

    metadata: {
      locationName: node.locationName,

      delayHours,

      incomingEdgeId: incomingEdge?.id || null,

      outgoingEdgeId: outgoingEdge?.id || null,
    },
  };
}

/* =========================================================
   ACTIVITY / STOP UNAVAILABLE
========================================================= */

function simulateActivityUnavailable(graph, scenario) {
  /*
     Current TripWise dependency graph contains destination
     stops rather than individual activity nodes.

     Therefore, for the current implementation this scenario
     treats the selected destination stop as unavailable.

     When activity-level itinerary records are added later,
     this same scenario type can target activity nodes.
  */

  const node = requireTargetNode(graph, scenario.targetNodeId);

  return {
    type: SCENARIO_TYPES.ACTIVITY_UNAVAILABLE,

    targetNodeId: node.id,

    severity: "high",

    impacts: [
      {
        nodeId: node.id,

        impactType: "stop-unavailable",

        severity: "high",

        message: `${node.locationName} is unavailable in the simulated scenario.`,
      },
    ],

    metadata: {
      locationName: node.locationName,
    },
  };
}

/* =========================================================
   REDUCED DAY TIME
========================================================= */

function simulateReducedDayTime(graph, scenario) {
  const node = requireTargetNode(graph, scenario.targetNodeId);

  const lostHours = normalizePositiveNumber(scenario.lostHours, 4);

  const severity = getReducedTimeSeverity(lostHours);

  const estimatedStayHours =
    node.stayDurationDays !== null ? node.stayDurationDays * 24 : null;

  const remainingHours =
    estimatedStayHours !== null
      ? Math.max(0, estimatedStayHours - lostHours)
      : null;

  return {
    type: SCENARIO_TYPES.REDUCED_DAY_TIME,

    targetNodeId: node.id,

    severity,

    impacts: [
      {
        nodeId: node.id,

        impactType: "available-time-reduced",

        severity,

        lostHours,

        estimatedStayHours,

        remainingHours,

        message: `${lostHours} hours of available trip time are removed from ${node.locationName}.`,
      },
    ],

    metadata: {
      locationName: node.locationName,

      lostHours,

      estimatedStayHours,

      remainingHours,
    },
  };
}

/* =========================================================
   SIMULATION ROUTER
========================================================= */

function runScenario(graph, scenario) {
  switch (scenario.type) {
    case SCENARIO_TYPES.WEATHER_DISRUPTION:
      return simulateWeatherDisruption(graph, scenario);

    case SCENARIO_TYPES.ARRIVAL_DELAY:
      return simulateArrivalDelay(graph, scenario);

    case SCENARIO_TYPES.ACTIVITY_UNAVAILABLE:
      return simulateActivityUnavailable(graph, scenario);

    case SCENARIO_TYPES.REDUCED_DAY_TIME:
      return simulateReducedDayTime(graph, scenario);

    default: {
      const error = new Error("Unsupported resilience scenario.");

      error.code = "UNSUPPORTED_SCENARIO";

      throw error;
    }
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

export function simulateTripScenario(graph, scenario) {
  validateGraph(graph);

  validateScenario(scenario);

  const result = runScenario(graph, scenario);

  return {
    scenarioId: scenario.id || `${scenario.type}-${Date.now()}`,

    type: result.type,

    targetNodeId: result.targetNodeId,

    severity: result.severity,

    impacts: result.impacts,

    impactedItems: result.impacts.length,

    metadata: result.metadata,

    simulatedAt: new Date().toISOString(),
  };
}

/* =========================================================
   MULTIPLE SCENARIOS
========================================================= */

export function simulateTripScenarios(graph, scenarios = []) {
  validateGraph(graph);

  if (!Array.isArray(scenarios)) {
    const error = new Error("Scenarios must be provided as an array.");

    error.code = "INVALID_SCENARIO_LIST";

    throw error;
  }

  return scenarios.map((scenario) => simulateTripScenario(graph, scenario));
}
