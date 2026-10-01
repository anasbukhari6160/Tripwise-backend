import {
  createTrip,
  deleteTrip,
  getTripById,
  listTrips,
  updateTrip,
} from "../services/trip.service.js";

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validTripId(value) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0;
}

/*
 * Prevent null, undefined and empty strings
 * from becoming 0 through Number().
 */
function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

function validateTrip(data) {
  const errors = [];

  const payload =
    data && typeof data === "object" && !Array.isArray(data) ? data : {};

  const title = typeof payload.title === "string" ? payload.title.trim() : "";

  const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";

  const startDate = payload.startDate;

  const endDate = payload.endDate;

  if (title.length < 2 || title.length > 120) {
    errors.push("Trip title must be between 2 and 120 characters.");
  }

  if (!validDate(startDate)) {
    errors.push("A valid start date is required.");
  }

  if (!validDate(endDate)) {
    errors.push("A valid end date is required.");
  }

  if (validDate(startDate) && validDate(endDate) && endDate < startDate) {
    errors.push("Trip end date cannot be before the start date.");
  }

  if (notes.length > 2000) {
    errors.push("Trip notes cannot exceed 2000 characters.");
  }

  if (!Array.isArray(payload.stops) || payload.stops.length < 1) {
    errors.push("At least one destination is required.");

    return {
      errors,
      value: null,
    };
  }

  if (payload.stops.length > 10) {
    errors.push("A trip can contain a maximum of 10 destinations.");
  }

  const normalizedStops = [];

  for (let index = 0; index < payload.stops.length; index += 1) {
    const rawStop = payload.stops[index];

    const stop =
      rawStop && typeof rawStop === "object" && !Array.isArray(rawStop)
        ? rawStop
        : {};

    const locationName =
      typeof stop.locationName === "string" ? stop.locationName.trim() : "";

    const city = typeof stop.city === "string" ? stop.city.trim() : "";

    const country = typeof stop.country === "string" ? stop.country.trim() : "";

    const countryCode =
      typeof stop.countryCode === "string"
        ? stop.countryCode.trim().toUpperCase()
        : null;

    const timezone =
      typeof stop.timezone === "string" ? stop.timezone.trim() : null;

    const latitude = parseCoordinate(stop.latitude);

    const longitude = parseCoordinate(stop.longitude);

    const arrivalDate =
      typeof stop.arrivalDate === "string" && stop.arrivalDate.trim()
        ? stop.arrivalDate.trim()
        : null;

    const departureDate =
      typeof stop.departureDate === "string" && stop.departureDate.trim()
        ? stop.departureDate.trim()
        : null;

    if (!locationName || locationName.length > 255) {
      errors.push(`Destination ${index + 1} has an invalid location name.`);
    }

    if (!city || city.length > 120) {
      errors.push(`Destination ${index + 1} has an invalid city.`);
    }

    if (!country || country.length > 120) {
      errors.push(`Destination ${index + 1} has an invalid country.`);
    }

    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      errors.push(`Destination ${index + 1} has an invalid country code.`);
    }

    if (latitude === null || latitude < -90 || latitude > 90) {
      errors.push(`Destination ${index + 1} has an invalid latitude.`);
    }

    if (longitude === null || longitude < -180 || longitude > 180) {
      errors.push(`Destination ${index + 1} has an invalid longitude.`);
    }

    if (timezone && timezone.length > 100) {
      errors.push(`Destination ${index + 1} has an invalid timezone.`);
    }

    if (arrivalDate && !validDate(arrivalDate)) {
      errors.push(`Destination ${index + 1} has an invalid arrival date.`);
    }

    if (departureDate && !validDate(departureDate)) {
      errors.push(`Destination ${index + 1} has an invalid departure date.`);
    }

    if (
      arrivalDate &&
      departureDate &&
      validDate(arrivalDate) &&
      validDate(departureDate) &&
      departureDate < arrivalDate
    ) {
      errors.push(
        `Destination ${index + 1} departure date cannot be before arrival date.`,
      );
    }

    if (
      arrivalDate &&
      validDate(arrivalDate) &&
      validDate(startDate) &&
      validDate(endDate) &&
      (arrivalDate < startDate || arrivalDate > endDate)
    ) {
      errors.push(
        `Destination ${index + 1} arrival date must be inside the trip dates.`,
      );
    }

    if (
      departureDate &&
      validDate(departureDate) &&
      validDate(startDate) &&
      validDate(endDate) &&
      (departureDate < startDate || departureDate > endDate)
    ) {
      errors.push(
        `Destination ${index + 1} departure date must be inside the trip dates.`,
      );
    }

    normalizedStops.push({
      locationName,
      city,
      country,
      countryCode,
      latitude,
      longitude,
      timezone,
      arrivalDate,
      departureDate,
    });
  }

  for (let index = 1; index < normalizedStops.length; index += 1) {
    const previous = normalizedStops[index - 1];

    const current = normalizedStops[index];

    const previousEnd = previous.departureDate || previous.arrivalDate;

    const currentStart = current.arrivalDate || current.departureDate;

    if (
      previousEnd &&
      currentStart &&
      validDate(previousEnd) &&
      validDate(currentStart) &&
      currentStart < previousEnd
    ) {
      errors.push(
        `Destination ${index + 1} cannot start before destination ${index} ends.`,
      );
    }
  }

  return {
    errors,

    value: {
      title,
      startDate,
      endDate,
      notes,
      stops: normalizedStops,
    },
  };
}

export async function getTrips(req, res) {
  try {
    const trips = await listTrips(req.userId);

    return res.status(200).json({
      success: true,
      trips,
    });
  } catch (error) {
    console.error("Get trips error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,
      message: "Unable to load trips.",
    });
  }
}

export async function getTrip(req, res) {
  try {
    if (!validTripId(req.params.tripId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trip ID.",
      });
    }

    const trip = await getTripById(req.userId, Number(req.params.tripId));

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found.",
      });
    }

    return res.status(200).json({
      success: true,
      trip,
    });
  } catch (error) {
    console.error("Get trip error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,
      message: "Unable to load trip.",
    });
  }
}

export async function createTripHandler(req, res) {
  try {
    const validation = validateTrip(req.body);

    if (validation.errors.length > 0) {
      return res.status(400).json({
        success: false,

        message: validation.errors[0],

        errors: validation.errors,
      });
    }

    const trip = await createTrip(req.userId, validation.value);

    return res.status(201).json({
      success: true,

      message: "Trip created successfully.",

      trip,
    });
  } catch (error) {
    console.error("Create trip error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,

      message: "Unable to create trip.",
    });
  }
}

export async function updateTripHandler(req, res) {
  try {
    if (!validTripId(req.params.tripId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trip ID.",
      });
    }

    const validation = validateTrip(req.body);

    if (validation.errors.length > 0) {
      return res.status(400).json({
        success: false,

        message: validation.errors[0],

        errors: validation.errors,
      });
    }

    const trip = await updateTrip(
      req.userId,

      Number(req.params.tripId),

      validation.value,
    );

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found.",
      });
    }

    return res.status(200).json({
      success: true,

      message: "Trip updated successfully.",

      trip,
    });
  } catch (error) {
    console.error("Update trip error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,

      message: "Unable to update trip.",
    });
  }
}

export async function deleteTripHandler(req, res) {
  try {
    if (!validTripId(req.params.tripId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trip ID.",
      });
    }

    const deleted = await deleteTrip(req.userId, Number(req.params.tripId));

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Trip not found.",
      });
    }

    return res.status(200).json({
      success: true,

      message: "Trip deleted successfully.",
    });
  } catch (error) {
    console.error("Delete trip error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,

      message: "Unable to delete trip.",
    });
  }
}
