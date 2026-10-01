import { sendContactEmail } from "../services/contact.service.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitContactMessage(req, res) {
  try {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};

    const name = typeof body.name === "string" ? body.name.trim() : "";

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";

    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, subject and message are required.",
      });
    }

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must be between 2 and 100 characters.",
      });
    }

    if (!EMAIL_REGEX.test(email) || email.length > 254) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (subject.length < 3 || subject.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Subject must be between 3 and 150 characters.",
      });
    }

    if (message.length < 10 || message.length > 3000) {
      return res.status(400).json({
        success: false,
        message: "Message must be between 10 and 3000 characters.",
      });
    }

    await sendContactEmail({
      name,
      email,
      subject,
      message,
    });

    return res.status(200).json({
      success: true,
      message: "Your message has been sent successfully.",
    });
  } catch (error) {
    console.error("Contact controller error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,
      message: "Unable to send your message. Please try again later.",
    });
  }
}
