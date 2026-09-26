function getWeatherCondition(code) {
  if (code === 0) {
    return "Clear sky";
  }

  if ([1, 2].includes(code)) {
    return "Partly cloudy";
  }

  if (code === 3) {
    return "Overcast";
  }

  if ([45, 48].includes(code)) {
    return "Fog";
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return "Drizzle";
  }

  if ([61, 63, 65, 66, 67].includes(code)) {
    return "Rain";
  }

  if ([71, 73, 75, 77].includes(code)) {
    return "Snow";
  }

  if ([80, 81, 82].includes(code)) {
    return "Rain showers";
  }

  if ([85, 86].includes(code)) {
    return "Snow showers";
  }

  if ([95, 96, 99].includes(code)) {
    return "Thunderstorm";
  }

  return "Unknown";
}

async function findLocation(city) {
  const geocodingUrl =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(city)}` +
    `&count=1` +
    `&language=en` +
    `&format=json`;

  const response = await fetch(geocodingUrl);

  if (!response.ok) {
    throw new Error("Unable to search for location.");
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    return null;
  }

  return data.results[0];
}
async function fetchForecast(latitude, longitude) {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto` +
    `&forecast_days=5`;

  const response = await fetch(weatherUrl);

  if (!response.ok) {
    throw new Error("Unable to retrieve weather information.");
  }

  return response.json();
}
function formatWeatherResponse(weather, location) {
  const forecast = weather.daily.time.map((date, index) => ({
    date,

    weatherCode: weather.daily.weather_code[index],

    condition: getWeatherCondition(weather.daily.weather_code[index]),

    maxTemperature: weather.daily.temperature_2m_max[index],

    minTemperature: weather.daily.temperature_2m_min[index],

    precipitationProbability:
      weather.daily.precipitation_probability_max[index],
  }));

  return {
    location: {
      name: location.name,
      country: location.country,
      region: location.region || null,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      timezone: weather.timezone,
    },

    current: {
      temperature: weather.current.temperature_2m,

      feelsLike: weather.current.apparent_temperature,

      humidity: weather.current.relative_humidity_2m,

      windSpeed: weather.current.wind_speed_10m,

      weatherCode: weather.current.weather_code,

      condition: getWeatherCondition(weather.current.weather_code),
    },

    forecast,
  };
}

export async function getWeatherByCity(city) {
  const location = await findLocation(city);

  if (!location) {
    return null;
  }

  const weather = await fetchForecast(location.latitude, location.longitude);

  return formatWeatherResponse(weather, {
    name: location.name,
    country: location.country,
    region: location.admin1 || null,
    latitude: location.latitude,
    longitude: location.longitude,
  });
}

export async function getWeatherByCoordinates(
  latitude,
  longitude,
  locationInfo,
) {
  const weather = await fetchForecast(latitude, longitude);

  return formatWeatherResponse(weather, {
    name: locationInfo.name,
    country: locationInfo.country,
    region: locationInfo.region || null,
    latitude,
    longitude,
  });
}

export async function searchLocationSuggestions(query) {
  const geocodingUrl =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(query)}` +
    `&count=6` +
    `&language=en` +
    `&format=json`;

  const response = await fetch(geocodingUrl);

  if (!response.ok) {
    throw new Error("Unable to search locations.");
  }

  const data = await response.json();

  if (!data.results) {
    return [];
  }

  return data.results.map((location) => ({
    id: location.id,
    name: location.name,
    country: location.country,
    countryCode: location.country_code || null,
    region: location.admin1 || null,
    district: location.admin2 || null,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone || null,
  }));
}
