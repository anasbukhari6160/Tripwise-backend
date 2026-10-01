import { buildTripDependencyGraph } from "./dependencyGraph.service.js";

import { simulateTripScenarios } from "./scenario.service.js";

import { generateRecoveryPlans } from "./recovery.service.js";

const SCORE_CONFIG = {
  BASE_SCORE: 100,

  GRAPH_CONFLICT_PENALTY: 18,

  SCENARIO_SEVERITY: {
    high: 18,
    moderate: 10,
    low: 5,
  },

  IMPACT_PENALTY: 2,

  REVIEW_REQUIRED_PENALTY: 5,

  RECOVERY_BONUS: {
    likely: 5,
    possible: 3,
    conditional: 1,
    "review-required": 0,
  },
};

function validateTrip(trip) {
  if (!trip || typeof trip !== "object") {
    const error = new Error(
      "A valid trip is required for resilience analysis.",
    );

    error.code = "INVALID_TRIP";

    throw error;
  }
}

function validateScenarios(scenarios) {
  if (!Array.isArray(scenarios)) {
    const error = new Error(
      "Stress-test scenarios must be provided as an array.",
    );

    error.code = "INVALID_SCENARIOS";

    throw error;
  }

  if (scenarios.length === 0) {
    const error = new Error("At least one stress-test scenario is required.");

    error.code = "EMPTY_SCENARIOS";

    throw error;
  }

  if (scenarios.length > 10) {
    const error = new Error(
      "A maximum of 10 stress-test scenarios can be evaluated at once.",
    );

    error.code = "TOO_MANY_SCENARIOS";

    throw error;
  }
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getSeverityPenalty(severity) {
  return SCORE_CONFIG.SCENARIO_SEVERITY[severity] || 0;
}

function getRecoveryBonus(recoveryPlan) {
  const action = recoveryPlan?.recommendedAction;

  if (!action) {
    return 0;
  }

  return SCORE_CONFIG.RECOVERY_BONUS[action.feasibility] || 0;
}

function calculateScenarioPenalty(scenarioResult, recoveryPlan) {
  const severityPenalty = getSeverityPenalty(scenarioResult.severity);

  const impactPenalty =
    scenarioResult.impacts.length * SCORE_CONFIG.IMPACT_PENALTY;

  const reviewPenalty = recoveryPlan?.summary?.requiresReview
    ? SCORE_CONFIG.REVIEW_REQUIRED_PENALTY
    : 0;

  const recoveryBonus = getRecoveryBonus(recoveryPlan);

  return Math.max(
    0,
    severityPenalty + impactPenalty + reviewPenalty - recoveryBonus,
  );
}

function calculateResilienceScore({ graph, scenarioResults, recoveryPlans }) {
  let score = SCORE_CONFIG.BASE_SCORE;

  const graphPenalty =
    graph.conflicts.length * SCORE_CONFIG.GRAPH_CONFLICT_PENALTY;

  score -= graphPenalty;

  const scenarioBreakdown = scenarioResults.map((scenarioResult, index) => {
    const recoveryPlan = recoveryPlans[index];

    const penalty = calculateScenarioPenalty(scenarioResult, recoveryPlan);

    score -= penalty;

    return {
      scenarioId: scenarioResult.scenarioId,

      type: scenarioResult.type,

      severity: scenarioResult.severity,

      penalty,

      recoveryBonus: getRecoveryBonus(recoveryPlan),
    };
  });

  return {
    score: clampScore(score),

    breakdown: {
      baseScore: SCORE_CONFIG.BASE_SCORE,

      graphConflictPenalty: graphPenalty,

      scenarios: scenarioBreakdown,
    },
  };
}

function getRiskLevel(score) {
  if (score >= 85) {
    return "low";
  }

  if (score >= 65) {
    return "moderate";
  }

  if (score >= 40) {
    return "high";
  }

  return "critical";
}

function getResilienceLabel(score) {
  if (score >= 85) {
    return "resilient";
  }

  if (score >= 65) {
    return "stable";
  }

  if (score >= 40) {
    return "fragile";
  }

  return "highly-fragile";
}

function buildRiskList({ graph, scenarioResults }) {
  const risks = [];

  graph.conflicts.forEach((conflict) => {
    risks.push({
      source: "trip-structure",

      type: conflict.type,

      severity: conflict.severity,

      nodeId: conflict.to,

      edgeId: conflict.edgeId,

      message: conflict.message,
    });
  });

  scenarioResults.forEach((scenario) => {
    scenario.impacts.forEach((impact) => {
      risks.push({
        source: "simulation",

        scenarioId: scenario.scenarioId,

        scenarioType: scenario.type,

        type: impact.impactType,

        severity: impact.severity || scenario.severity,

        nodeId: impact.nodeId || scenario.targetNodeId,

        edgeId: impact.edgeId || null,

        message: impact.message,
      });
    });
  });

  return risks;
}

function summarizeRisks(risks) {
  const summary = {
    total: risks.length,

    high: 0,

    moderate: 0,

    low: 0,
  };

  risks.forEach((risk) => {
    if (Object.prototype.hasOwnProperty.call(summary, risk.severity)) {
      summary[risk.severity] += 1;
    }
  });

  return summary;
}

function summarizeRecoveryPlans(recoveryPlans) {
  const actionCount = recoveryPlans.reduce(
    (total, plan) => total + plan.actions.length,
    0,
  );

  const reviewRequired = recoveryPlans.filter(
    (plan) => plan.summary.requiresReview,
  ).length;

  const recoverableScenarios = recoveryPlans.filter(
    (plan) => plan.recoveryAvailable,
  ).length;

  return {
    totalPlans: recoveryPlans.length,

    totalActions: actionCount,

    recoverableScenarios,

    reviewRequired,

    automaticChangesApplied: false,
  };
}

export function runTripStressTest(trip, scenarios) {
  validateTrip(trip);

  validateScenarios(scenarios);

  const graph = buildTripDependencyGraph(trip);

  const scenarioResults = simulateTripScenarios(graph, scenarios);

  const recoveryPlans = generateRecoveryPlans(graph, scenarioResults);

  const risks = buildRiskList({
    graph,
    scenarioResults,
  });

  const scoreResult = calculateResilienceScore({
    graph,
    scenarioResults,
    recoveryPlans,
  });

  const resilienceScore = scoreResult.score;

  return {
    success: true,

    trip: {
      id: graph.trip.id,

      title: graph.trip.title,

      totalStops: graph.trip.totalStops,

      durationDays: graph.trip.tripDurationDays,
    },

    resilience: {
      score: resilienceScore,

      label: getResilienceLabel(resilienceScore),

      riskLevel: getRiskLevel(resilienceScore),
    },

    riskSummary: summarizeRisks(risks),

    risks,

    scenarios: scenarioResults,

    recoveryPlans,

    recoverySummary: summarizeRecoveryPlans(recoveryPlans),

    graphSummary: {
      nodes: graph.metadata.nodeCount,

      edges: graph.metadata.edgeCount,

      existingConflicts: graph.metadata.conflictCount,
    },

    scoreBreakdown: scoreResult.breakdown,

    metadata: {
      simulationOnly: true,

      databaseModified: false,

      scenarioCount: scenarioResults.length,

      generatedAt: new Date().toISOString(),
    },
  };
}
