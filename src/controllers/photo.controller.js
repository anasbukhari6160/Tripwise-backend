import { searchDestinationPhotos } from "../services/photo.service.js";

export async function getDestinationPhotos(req, res) {
  try {
    const city = req.query.city?.trim();

    const country = req.query.country?.trim();

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "City is required.",
      });
    }

    if (city.length > 120) {
      return res.status(400).json({
        success: false,
        message: "City is too long.",
      });
    }

    if (country && country.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Country is too long.",
      });
    }

    const photos = await searchDestinationPhotos({
      city,
      country,
    });

    return res.status(200).json({
      success: true,
      provider: "Pexels",
      photos,
    });
  } catch (error) {
    console.error("Destination photo error:", error);

    return res.status(502).json({
      success: false,
      message: "Unable to load destination photos.",
    });
  }
}
