import express from "express";

import {
  getWeather,
  getWeatherByLocation,
  searchLocations,
} from "../controllers/weather.controller.js";

const router = express.Router();

router.get("/locations", searchLocations);

router.get("/location", getWeatherByLocation);

router.get("/", getWeather);

export default router;
