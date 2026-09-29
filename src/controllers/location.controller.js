import { searchLocations } from "../services/location.service.js";

export async function searchDestinations(req, res) {
  try {
    const query = req.query.q?.trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Destination search query is required.",
      });
    }

    if (query.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Enter at least 2 characters.",
      });
    }

    if (query.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Destination search is too long.",
      });
    }

    const locations = await searchLocations(query);

    return res.status(200).json({
      success: true,
      locations,
    });
  } catch (error) {
    console.error("Destination search error:", error);

    return res.status(502).json({
      success: false,
      message: "Unable to search destinations right now.",
    });
  }
}
