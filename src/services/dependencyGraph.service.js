

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function differenceInHours(start, end) {
  const startDate = parseDate(start);

  const endDate = parseDate(end);

  if (!startDate || !endDate) {
    return null;
  }

  const difference = endDate.getTime() - startDate.getTime();

  return Math.round(difference / (1000 * 60 * 60));
}

function differenceInDays(start, end) {
  const hours = differenceInHours(start, end);

  if (hours === null) {
    return null;
  }

  return Math.max(0, Math.ceil(hours / 24));
}

function createStopNode(stop, index) {
  return {
    id: String(stop.id ?? `stop-${index + 1}`),

    type: "destination",

    order: index,

    locationName: stop.locationName || stop.city || "Unknown destination",

    city: stop.city || null,

    country: stop.country || null,

    countryCode: stop.countryCode || null,

    latitude: stop.latitude ?? null,

    longitude: stop.longitude ?? null,

    timezone: stop.timezone || null,

    arrivalDate: stop.arrivalDate || null,

    departureDate: stop.departureDate || null,

    stayDurationDays: differenceInDays(stop.arrivalDate, stop.departureDate),

    dependencies: [],
  };
}

function createTravelEdge(currentStop, nextStop) {
  const availableHours = differenceInHours(
    currentStop.departureDate,
    nextStop.arrivalDate,
  );

  let status = "unknown";

  if (availableHours !== null) {
    if (availableHours < 0) {
      status = "conflict";
    } else if (availableHours <= 6) {
      status = "tight";
    } else {
      status = "healthy";
    }
  }

  return {
    id: `${currentStop.id}->${nextStop.id}`,

    type: "travel-sequence",

    from: currentStop.id,

    to: nextStop.id,

    availableHours,

    status,

    constraint: {
      sourceDeparture: currentStop.departureDate,

      destinationArrival: nextStop.arrivalDate,
    },
  };
}

function detectGraphConflicts(edges) {
  return edges
    .filter((edge) => edge.status === "conflict")
    .map((edge) => ({
      type: "schedule-conflict",

      severity: "high",

      edgeId: edge.id,

      from: edge.from,

      to: edge.to,

      message:
        "The next destination begins before the previous destination has ended.",

      availableHours: edge.availableHours,
    }));
}

export function buildTripDependencyGraph(trip) {
  if (!trip || typeof trip !== "object") {
    const error = new Error(
      "A valid trip is required to build a dependency graph.",
    );

    error.code = "INVALID_TRIP";

    throw error;
  }

  const rawStops = Array.isArray(trip.stops) ? trip.stops : [];

  const nodes = rawStops.map((stop, index) => createStopNode(stop, index));

  const edges = [];

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const currentStop = nodes[index];

    const nextStop = nodes[index + 1];

    const edge = createTravelEdge(currentStop, nextStop);

    edges.push(edge);

    nextStop.dependencies.push(currentStop.id);
  }

  const conflicts = detectGraphConflicts(edges);

  return {
    trip: {
      id: trip.id || null,

      title: trip.title || "Untitled trip",

      startDate: trip.startDate || null,

      endDate: trip.endDate || null,

      totalStops: nodes.length,

      tripDurationDays: differenceInDays(trip.startDate, trip.endDate),
    },

    nodes,

    edges,

    conflicts,

    metadata: {
      nodeCount: nodes.length,

      edgeCount: edges.length,

      conflictCount: conflicts.length,

      generatedAt: new Date().toISOString(),
    },
  };
}
