import { chatWithTripWise } from "../services/ai.service.js";

/* =========================================================
   TRIPWISE AI CHAT
========================================================= */

export async function chatWithAi(req, res) {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        message: "Messages must be provided as an array.",
        code: "INVALID_MESSAGES",
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        message: "At least one message is required.",
        code: "EMPTY_MESSAGES",
      });
    }

    if (messages.length > 30) {
      return res.status(400).json({
        message: "Too many conversation messages were provided.",
        code: "TOO_MANY_MESSAGES",
      });
    }

    const result = await chatWithTripWise(messages);

    return res.status(200).json({
      success: true,

      message: result.reply,

      responseId: result.responseId,

      usage: result.usage,

      grounded: result.grounded,

      sources: result.sources,
    });
  } catch (error) {
    console.error("TripWise AI controller error:", error);

    const status = Number.isInteger(error.status) ? error.status : 500;

    return res.status(status).json({
      success: false,

      message: error.message || "Unable to process the AI request.",

      code: error.code || "AI_REQUEST_FAILED",
    });
  }
}
