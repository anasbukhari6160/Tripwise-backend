const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

function buildLocationName(location) {
  const parts = [location.name, location.admin1, location.country].filter(
    Boolean,
  );

  return [...new Set(parts)].join(", ");
}

export async function searchLocations(query) {
  const normalizedQuery = query?.trim();

  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    name: normalizedQuery,
    count: "8",
    language: "en",
    format: "json",
  });

  const response = await fetch(`${GEOCODING_URL}?${params.toString()}`, { signal: AbortSignal.timeout(10000) });

  if (!response.ok) {
    throw new Error("Unable to search destinations.");
  }

  const data = await response.json();

  if (!Array.isArray(data.results)) {
    return [];
  }

  return data.results
    .filter(
      (location) =>
        location.name &&
        location.country &&
        Number.isFinite(location.latitude) &&
        Number.isFinite(location.longitude),
    )
    .map((location) => ({
      id: location.id,
      locationName: buildLocationName(location),
      city: location.name,
      country: location.country,
      countryCode: location.country_code || null,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone || null,
      region: location.admin1 || null,
    }));
}
