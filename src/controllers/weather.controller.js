import {
  getWeatherByCity,
  getWeatherByCoordinates,
  searchLocationSuggestions,
} from "../services/weather.service.js";

export async function getWeather(req, res) {
  try {
    const city = req.query.city?.trim();

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "City is required.",
      });
    }

    const weather = await getWeatherByCity(city);

    if (!weather) {
      return res.status(404).json({
        success: false,
        message: "City not found.",
      });
    }

    return res.status(200).json({
      success: true,
      weather,
    });
  } catch (error) {
    console.error("Weather API error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve weather information.",
    });
  }
}

export async function searchLocations(req, res) {
  try {
    const query = req.query.query?.trim();

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Enter at least 2 characters.",
      });
    }

    const locations = await searchLocationSuggestions(query);

    return res.status(200).json({
      success: true,
      locations,
    });
  } catch (error) {
    console.error("Location search error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to search locations.",
    });
  }
}

export async function getWeatherByLocation(req, res) {
  try {
    const { latitude, longitude, name, country, region } = req.query;

    if (
      latitude === undefined ||
      longitude === undefined ||
      !name?.trim() ||
      !country?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Location coordinates, name and country are required.",
      });
    }

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location coordinates.",
      });
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({
        success: false,
        message: "Location coordinates are outside the valid range.",
      });
    }

    const weather = await getWeatherByCoordinates(lat, lon, {
      name: name.trim(),
      country: country.trim(),
      region: region?.trim() || null,
    });

    return res.status(200).json({
      success: true,
      weather,
    });
  } catch (error) {
    console.error("Coordinate weather error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve weather information.",
    });
  }
}
