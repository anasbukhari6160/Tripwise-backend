const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";

function normalizePhoto(photo) {
  return {
    id: photo.id,
    imageUrl:
      photo.src?.large2x || photo.src?.large || photo.src?.medium || null,
    landscapeUrl: photo.src?.landscape || photo.src?.large || null,
    photographer: photo.photographer || "Pexels photographer",
    photographerUrl: photo.photographer_url || null,
    pexelsUrl: photo.url || null,
    averageColor: photo.avg_color || null,
    width: Number(photo.width) || null,
    height: Number(photo.height) || null,
  };
}

async function requestPexels(query) {
  const apiKey = process.env.PEXELS_API_KEY;

  if (!apiKey) {
    throw new Error("PEXELS_API_KEY is not configured.");
  }

  const params = new URLSearchParams({
    query,
    orientation: "landscape",
    per_page: "6",
    page: "1",
  });

  const response = await fetch(`${PEXELS_SEARCH_URL}?${params.toString()}`, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Pexels request failed with status ${response.status}.`);
  }

  const data = await response.json();

  if (!Array.isArray(data.photos)) {
    return [];
  }

  return data.photos.map(normalizePhoto).filter((photo) => photo.imageUrl);
}

export async function searchDestinationPhotos({ city, country }) {
  const cleanCity = city?.trim();

  const cleanCountry = country?.trim();

  if (!cleanCity) {
    return [];
  }

  const queries = [
    `${cleanCity} ${cleanCountry || ""} travel`,
    `${cleanCity} ${cleanCountry || ""} city`,
    `${cleanCity} tourism`,
  ];

  for (const query of queries) {
    const photos = await requestPexels(query.trim());

    if (photos.length > 0) {
      return photos;
    }
  }

  return [];
}
