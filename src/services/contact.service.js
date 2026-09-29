import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendContactEmail({ name, email, subject, message }) {
  const receiverEmail = process.env.CONTACT_RECEIVER_EMAIL;

  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!receiverEmail) {
    throw new Error("CONTACT_RECEIVER_EMAIL is not configured.");
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);

  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");

  const currentYear = new Date().getFullYear();

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "TripWise <onboarding@resend.dev>",

    to: [receiverEmail],

    replyTo: email,

    subject: `TripWise Contact: ${subject}`,

    html: `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />

    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0"
    />

    <title>TripWise Contact Message</title>
  </head>

  <body
    style="
      margin: 0;
      padding: 0;
      background-color: #020703;
      font-family: Arial, Helvetica, sans-serif;
      color: #ffffff;
    "
  >
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="
        width: 100%;
        background-color: #020703;
        border-collapse: collapse;
      "
    >
      <tr>
        <td
          align="center"
          style="
            padding: 20px 16px;
          "
        >
          <!-- =========================
               MAIN CARD
          ========================== -->

          <table
            role="presentation"
            width="560"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="
              width: 100%;
              max-width: 560px;
              background-color: #071006;
              border: 1px solid #26351f;
              border-radius: 18px;
              overflow: hidden;
              border-collapse: separate;
            "
          >
            <!-- =========================
                 BRAND HEADER
            ========================== -->

            <tr>
              <td
                style="
                  padding: 31px 38px;
                  border-bottom: 1px solid #26351f;
                "
              >
                <div
                  style="
                    margin: 0;
                    color: #ffffff;
                    font-size: 24px;
                    font-weight: 800;
                    line-height: 1;
                    letter-spacing: -0.8px;
                  "
                >Trip<span style="color: #caff33;">Wise</span></div>
              </td>
            </tr>

            <!-- =========================
                 EMAIL CONTENT
            ========================== -->

            <tr>
              <td
                style="
                  padding: 39px 38px 36px;
                "
              >
                <!-- LABEL -->

                <div
                  style="
                    margin: 0 0 17px;
                    color: #caff33;
                    font-size: 13px;
                    font-weight: 800;
                    line-height: 1.2;
                    letter-spacing: 0.9px;
                    text-transform: uppercase;
                  "
                >
                  CONTACT MESSAGE
                </div>

                <!-- TITLE -->

                <h1
                  style="
                    margin: 0 0 22px;
                    color: #ffffff;
                    font-size: 28px;
                    font-weight: 800;
                    line-height: 1.2;
                    letter-spacing: -0.7px;
                  "
                >
                  New support message
                </h1>

                <!-- INTRO -->

                <p
                  style="
                    margin: 0 0 10px;
                    color: #9da798;
                    font-size: 14px;
                    line-height: 1.7;
                  "
                >
                  Hi TripWise,
                </p>

                <p
                  style="
                    margin: 0 0 30px;
                    color: #9da798;
                    font-size: 14px;
                    line-height: 1.7;
                  "
                >
                  A new message has been submitted through the
                  TripWise Contact Us form. Review the sender
                  information and message below.
                </p>

                <!-- =========================
                     SENDER INFORMATION
                ========================== -->

                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="
                    width: 100%;
                    margin: 0 0 30px;
                    border-collapse: collapse;
                  "
                >
                  <tr>
                    <td
                      width="90"
                      style="
                        padding: 0 0 14px;
                        color: #7e8879;
                        font-size: 12px;
                        line-height: 1.5;
                        vertical-align: top;
                      "
                    >
                      Name
                    </td>

                    <td
                      style="
                        padding: 0 0 14px;
                        color: #f1f4ee;
                        font-size: 13px;
                        font-weight: 700;
                        line-height: 1.5;
                        vertical-align: top;
                      "
                    >
                      ${safeName}
                    </td>
                  </tr>

                  <tr>
                    <td
                      width="90"
                      style="
                        padding: 0 0 14px;
                        color: #7e8879;
                        font-size: 12px;
                        line-height: 1.5;
                        vertical-align: top;
                      "
                    >
                      Email
                    </td>

                    <td
                      style="
                        padding: 0 0 14px;
                        font-size: 13px;
                        font-weight: 700;
                        line-height: 1.5;
                        vertical-align: top;
                      "
                    >
                      <a
                        href="mailto:${safeEmail}"
                        style="
                          color: #caff33;
                          text-decoration: none;
                        "
                      >
                        ${safeEmail}
                      </a>
                    </td>
                  </tr>

                  <tr>
                    <td
                      width="90"
                      style="
                        padding: 0;
                        color: #7e8879;
                        font-size: 12px;
                        line-height: 1.5;
                        vertical-align: top;
                      "
                    >
                      Subject
                    </td>

                    <td
                      style="
                        padding: 0;
                        color: #f1f4ee;
                        font-size: 13px;
                        font-weight: 700;
                        line-height: 1.5;
                        vertical-align: top;
                      "
                    >
                      ${safeSubject}
                    </td>
                  </tr>
                </table>

                <!-- =========================
                     MESSAGE
                ========================== -->

                <div
                  style="
                    margin: 0 0 12px;
                    color: #caff33;
                    font-size: 11px;
                    font-weight: 800;
                    line-height: 1.3;
                    letter-spacing: 0.9px;
                    text-transform: uppercase;
                  "
                >
                  MESSAGE
                </div>

                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="
                    width: 100%;
                    border-collapse: separate;
                  "
                >
                  <tr>
                    <td
                      style="
                        padding: 19px;
                        background-color: #020703;
                        border: 1px solid #26351f;
                        border-radius: 12px;
                        color: #edf1e9;
                        font-size: 13px;
                        line-height: 1.75;
                        word-break: break-word;
                      "
                    >
                      ${safeMessage}
                    </td>
                  </tr>
                </table>

                <!-- =========================
                     DIVIDER
                ========================== -->

                <div
                  style="
                    height: 1px;
                    margin: 31px 0 25px;
                    background-color: #26351f;
                  "
                ></div>

                <!-- =========================
                     FOOT NOTE
                ========================== -->

                <p
                  style="
                    margin: 0;
                    color: #687264;
                    font-size: 11px;
                    line-height: 1.65;
                  "
                >
                  This message was submitted through the TripWise
                  Contact Us form. You can reply directly to this
                  email to respond to ${safeName}.
                </p>
              </td>
            </tr>
          </table>

          <!-- =========================
               OUTSIDE FOOTER
          ========================== -->

          <table
            role="presentation"
            width="560"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="
              width: 100%;
              max-width: 560px;
              border-collapse: collapse;
            "
          >
            <tr>
              <td
                align="center"
                style="
                  padding: 26px 20px 8px;
                  color: #687264;
                  font-size: 11px;
                  line-height: 1.7;
                "
              >
                © ${currentYear} TripWise
                <br />
                Travel smarter. Plan better.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `,

    text: `
TripWise

CONTACT MESSAGE

New support message

Hi TripWise,

A new message has been submitted through the TripWise Contact Us form.

Name: ${name}
Email: ${email}
Subject: ${subject}

MESSAGE

${message}

This message was submitted through the TripWise Contact Us form.
You can reply directly to this email to respond to ${name}.

© ${currentYear} TripWise
Travel smarter. Plan better.
    `.trim(),
  });

  if (error) {
    console.error("Resend contact email error:", error);

    throw new Error("Unable to send contact message.");
  }

  return data;
}
