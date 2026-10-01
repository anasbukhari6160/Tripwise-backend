import Stripe from "stripe";

import { env } from "./env.js";

if (!env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is missing.");
}

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { timeout: 20000, maxNetworkRetries: 1 });

export default stripe;
