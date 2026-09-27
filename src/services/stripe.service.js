import stripe from "../config/stripe.js";

export async function createStripeCustomer(user) {
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: {
      userId: String(user.id),
    },
  });

  return customer;
}

export async function createCheckoutSession({ userId, customerId }) {
  if (!process.env.STRIPE_PRICE_ID) {
    throw new Error("STRIPE_PRICE_ID is missing.");
  }

  if (!process.env.FRONTEND_URL) {
    throw new Error("FRONTEND_URL is missing.");
  }

  const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",

    customer: customerId,

    client_reference_id: String(userId),

    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      },
    ],

    success_url:
      `${frontendUrl}/payment/success` + "?session_id={CHECKOUT_SESSION_ID}",

    cancel_url: `${frontendUrl}/payment/cancel`,

    metadata: {
      userId: String(userId),
    },

    subscription_data: {
      metadata: {
        userId: String(userId),
      },
    },
  });

  return session;
}
