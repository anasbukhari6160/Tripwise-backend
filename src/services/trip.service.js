import pool from "../config/db.js";

/*
 * PostgreSQL DATE values should always be returned to the
 * frontend as YYYY-MM-DD strings.
 */
function formatDateOnly(value) {
  if (!value) {
    return null;
  }

  /*
   * PostgreSQL may already return a DATE as YYYY-MM-DD.
   */
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  /*
   * Handle Date objects safely using UTC values.
   */
  if (value instanceof Date) {
    const year = value.getUTCFullYear();

    const month = String(value.getUTCMonth() + 1).padStart(2, "0");

    const day = String(value.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return null;
}

function mapStop(row) {
  return {
    id: Number(row.id),

    locationName: row.location_name,

    city: row.city,

    country: row.country,

    countryCode: row.country_code,

    latitude: Number(row.latitude),

    longitude: Number(row.longitude),

    timezone: row.timezone,

    arrivalDate: formatDateOnly(row.arrival_date),

    departureDate: formatDateOnly(row.departure_date),

    position: Number(row.position),
  };
}

function mapTrip(row, stops = []) {
  return {
    id: Number(row.id),

    title: row.title,

    startDate: formatDateOnly(row.start_date),

    endDate: formatDateOnly(row.end_date),

    notes: row.notes || "",

    createdAt: row.created_at,

    updatedAt: row.updated_at,

    stops,
  };
}

async function getStopsForTripIds(tripIds, executor = pool) {
  if (tripIds.length === 0) {
    return new Map();
  }

  const result = await executor.query(
    `
      SELECT
        id,
        trip_id,
        location_name,
        city,
        country,
        country_code,
        latitude,
        longitude,
        timezone,
        arrival_date,
        departure_date,
        position
      FROM trip_stops
      WHERE trip_id = ANY($1::int[])
      ORDER BY trip_id ASC, position ASC
    `,
    [tripIds],
  );

  const stopMap = new Map();

  for (const row of result.rows) {
    const tripId = Number(row.trip_id);

    if (!stopMap.has(tripId)) {
      stopMap.set(tripId, []);
    }

    stopMap.get(tripId).push(mapStop(row));
  }

  return stopMap;
}

export async function listTrips(userId) {
  const result = await pool.query(
    `
      SELECT
        id,
        title,
        start_date,
        end_date,
        notes,
        created_at,
        updated_at
      FROM trips
      WHERE user_id = $1
      ORDER BY
        CASE
          WHEN end_date >= CURRENT_DATE
            THEN 0
          ELSE 1
        END,
        start_date ASC,
        id DESC
    `,
    [userId],
  );

  const tripIds = result.rows.map((row) => Number(row.id));

  const stopMap = await getStopsForTripIds(tripIds);

  return result.rows.map((row) => {
    const tripId = Number(row.id);

    return mapTrip(row, stopMap.get(tripId) || []);
  });
}

export async function getTripById(userId, tripId, executor = pool) {
  const result = await executor.query(
    `
      SELECT
        id,
        title,
        start_date,
        end_date,
        notes,
        created_at,
        updated_at
      FROM trips
      WHERE id = $1
        AND user_id = $2
    `,
    [tripId, userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  const numericTripId = Number(row.id);

  const stopMap = await getStopsForTripIds([numericTripId], executor);

  return mapTrip(row, stopMap.get(numericTripId) || []);
}

async function insertStops(client, tripId, stops) {
  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index];

    await client.query(
      `
        INSERT INTO trip_stops (
          trip_id,
          location_name,
          city,
          country,
          country_code,
          latitude,
          longitude,
          timezone,
          arrival_date,
          departure_date,
          position
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11
        )
      `,
      [
        tripId,
        stop.locationName,
        stop.city,
        stop.country,
        stop.countryCode || null,
        stop.latitude,
        stop.longitude,
        stop.timezone || null,
        stop.arrivalDate || null,
        stop.departureDate || null,
        index,
      ],
    );
  }
}

export async function createTrip(userId, tripData) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        INSERT INTO trips (
          user_id,
          title,
          start_date,
          end_date,
          notes
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [
        userId,
        tripData.title,
        tripData.startDate,
        tripData.endDate,
        tripData.notes || null,
      ],
    );

    const tripId = Number(result.rows[0].id);

    await insertStops(client, tripId, tripData.stops);

    const trip = await getTripById(userId, tripId, client);

    await client.query("COMMIT");

    return trip;
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
}

export async function updateTrip(userId, tripId, tripData) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ownershipResult = await client.query(
      `
          SELECT id
          FROM trips
          WHERE id = $1
            AND user_id = $2
          FOR UPDATE
        `,
      [tripId, userId],
    );

    if (ownershipResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return null;
    }

    await client.query(
      `
        UPDATE trips
        SET
          title = $1,
          start_date = $2,
          end_date = $3,
          notes = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
          AND user_id = $6
      `,
      [
        tripData.title,
        tripData.startDate,
        tripData.endDate,
        tripData.notes || null,
        tripId,
        userId,
      ],
    );

    await client.query(
      `
        DELETE FROM trip_stops
        WHERE trip_id = $1
      `,
      [tripId],
    );

    await insertStops(client, tripId, tripData.stops);

    const trip = await getTripById(userId, tripId, client);

    await client.query("COMMIT");

    return trip;
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
}

export async function deleteTrip(userId, tripId) {
  const result = await pool.query(
    `
      DELETE FROM trips
      WHERE id = $1
        AND user_id = $2
      RETURNING id
    `,
    [tripId, userId],
  );

  return result.rows.length > 0;
}
export async function removeTripStop(userId, tripId, stopId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* =====================================================
       VERIFY TRIP OWNERSHIP
    ===================================================== */

    const ownershipResult = await client.query(
      `
          SELECT id
          FROM trips
          WHERE id = $1
            AND user_id = $2
          FOR UPDATE
        `,
      [tripId, userId],
    );

    if (ownershipResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return {
        ok: false,
        reason: "TRIP_NOT_FOUND",
      };
    }

    /* =====================================================
       LOCK AND LOAD CURRENT STOPS
    ===================================================== */

    const stopsResult = await client.query(
      `
          SELECT
            id,
            position
          FROM trip_stops
          WHERE trip_id = $1
          ORDER BY
            position ASC,
            id ASC
          FOR UPDATE
        `,
      [tripId],
    );

    const stops = stopsResult.rows;

    /* =====================================================
       DO NOT ALLOW EMPTY TRIP
    ===================================================== */

    if (stops.length <= 1) {
      await client.query("ROLLBACK");

      return {
        ok: false,
        reason: "LAST_STOP",
      };
    }

    /* =====================================================
       VERIFY TARGET STOP
    ===================================================== */

    const targetExists = stops.some(
      (stop) => Number(stop.id) === Number(stopId),
    );

    if (!targetExists) {
      await client.query("ROLLBACK");

      return {
        ok: false,
        reason: "STOP_NOT_FOUND",
      };
    }

    /* =====================================================
       DELETE TARGET STOP
    ===================================================== */

    await client.query(
      `
        DELETE FROM trip_stops
        WHERE id = $1
          AND trip_id = $2
      `,
      [stopId, tripId],
    );

    /* =====================================================
       NORMALIZE POSITIONS

       Example:
       0, 1, 2, 3

       remove position 1

       becomes:
       0, 1, 2
    ===================================================== */

    await client.query(
      `
        WITH ordered_stops AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              ORDER BY
                position ASC,
                id ASC
            ) - 1 AS new_position
          FROM trip_stops
          WHERE trip_id = $1
        )
        UPDATE trip_stops AS stop
        SET position =
          ordered_stops.new_position
        FROM ordered_stops
        WHERE stop.id =
          ordered_stops.id
      `,
      [tripId],
    );

    /* =====================================================
       UPDATE TRIP TIMESTAMP
    ===================================================== */

    await client.query(
      `
        UPDATE trips
        SET updated_at =
          CURRENT_TIMESTAMP
        WHERE id = $1
          AND user_id = $2
      `,
      [tripId, userId],
    );

    /* =====================================================
       RETURN UPDATED TRIP
    ===================================================== */

    const trip = await getTripById(userId, tripId, client);

    await client.query("COMMIT");

    return {
      ok: true,

      removedStopId: Number(stopId),

      trip,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
}
