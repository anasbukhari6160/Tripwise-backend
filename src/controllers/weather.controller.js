import { getWeatherByCity } from "../services/weather.service.js";

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
