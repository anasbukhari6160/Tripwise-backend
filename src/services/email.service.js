import { Resend } from "resend";

export async function sendVerificationEmail(email, verificationCode, name) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const codeBlocks = verificationCode
    .split("")
    .map(
      (digit) => `
        <td
          align="center"
          valign="middle"
          style="
            width: 52px;
            height: 58px;
            background-color: #050805;
            border: 1px solid #34402e;
            border-radius: 10px;
            color: #ffffff;
            font-size: 24px;
            font-weight: 700;
          "
        >
          ${digit}
        </td>
      `,
    )
    .join("");

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Verify your TripWise email address",

    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
        </head>

        <body
          style="
            margin: 0;
            padding: 0;
            background-color: #050805;
            font-family: Arial, Helvetica, sans-serif;
          "
        >
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="
              background-color: #050805;
              padding: 48px 16px;
            "
          >
            <tr>
              <td align="center">

                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="
                    max-width: 560px;
                    background-color: #0b1008;
                    border: 1px solid #242d20;
                    border-radius: 20px;
                    overflow: hidden;
                  "
                >

                  <tr>
                    <td
                      style="
                        padding: 28px 38px;
                        border-bottom: 1px solid #242d20;
                      "
                    >
                      <div
                        style="
                          font-size: 22px;
                          font-weight: 700;
                          color: #ffffff;
                        "
                      >
                        Trip<span style="color: #caff33;">Wise</span>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 40px 38px;">

                      <p
                        style="
                          margin: 0 0 14px;
                          color: #caff33;
                          font-size: 12px;
                          font-weight: 700;
                          letter-spacing: 1.5px;
                        "
                      >
                        EMAIL VERIFICATION
                      </p>

                      <h1
                        style="
                          margin: 0 0 18px;
                          color: #ffffff;
                          font-size: 28px;
                          line-height: 1.3;
                        "
                      >
                        Verify your email address
                      </h1>

                      <p
                        style="
                          margin: 0 0 8px;
                          color: #a4ad9f;
                          font-size: 15px;
                          line-height: 1.7;
                        "
                      >
                        Hi ${name || "there"},
                      </p>

                      <p
                        style="
                          margin: 0 0 30px;
                          color: #a4ad9f;
                          font-size: 15px;
                          line-height: 1.7;
                        "
                      >
                        Enter the verification code below to confirm
                        your email address and finish setting up your
                        TripWise account.
                      </p>

                      <table
                        role="presentation"
                        width="100%"
                        cellspacing="0"
                        cellpadding="0"
                        border="0"
                      >
                        <tr>
                          <td align="center">

                            <table
                              role="presentation"
                              cellspacing="8"
                              cellpadding="0"
                              border="0"
                            >
                              <tr>
                                ${codeBlocks}
                              </tr>
                            </table>

                          </td>
                        </tr>
                      </table>

                      <p
                        style="
                          margin: 26px 0 0;
                          text-align: center;
                          color: #818b7c;
                          font-size: 13px;
                        "
                      >
                        This code will expire in
                        <strong style="color: #c7cec3;">
                          10 minutes
                        </strong>.
                      </p>

                      <div
                        style="
                          height: 1px;
                          background-color: #242d20;
                          margin: 34px 0 24px;
                        "
                      ></div>

                      <p
                        style="
                          margin: 0;
                          color: #717a6d;
                          font-size: 12px;
                          line-height: 1.6;
                        "
                      >
                        If you didn't create a TripWise account,
                        you can safely ignore this email.
                      </p>

                    </td>
                  </tr>
                </table>

                <p
                  style="
                    margin: 24px 0 0;
                    color: #687163;
                    font-size: 12px;
                    line-height: 1.7;
                    text-align: center;
                  "
                >
                  © 2026 TripWise<br />
                  Travel smarter. Plan better.
                </p>

              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error("[Resend API Error]:", error);
    throw new Error(error.message);
  }
}
