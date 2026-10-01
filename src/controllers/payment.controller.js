import stripe from "../config/stripe.js";
import { env } from "../config/env.js";

import {
  createStripeCustomer,
  createCheckoutSession,
} from "../services/stripe.service.js";

import pool from "../config/db.js";

export async function createCheckout(req, res) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const userResult = await pool.query(
      `
        SELECT
          id,
          name,
          email,
          plan,
          stripe_customer_id,
          stripe_subscription_id,
          subscription_status
        FROM users
        WHERE id = $1
      `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = userResult.rows[0];

    if (
      user.plan === "pro" &&
      ["active", "trialing"].includes(user.subscription_status)
    ) {
      return res.status(409).json({
        success: false,
        message: "You already have an active Pro subscription.",
      });
    }

    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await createStripeCustomer(user);

      customerId = customer.id;

      await pool.query(
        `
          UPDATE users
          SET stripe_customer_id = $1
          WHERE id = $2
        `,
        [customerId, user.id],
      );
    }

    const session = await createCheckoutSession({
      userId: user.id,
      customerId,
    });

    return res.status(200).json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Create checkout error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,
      message: "Unable to create checkout session.",
    });
  }
}

function subscriptionPeriodEnd(subscription) {
  const periodEnd = subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000) : null;
}

async function syncSubscription(subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error("Stripe subscription is missing userId metadata.");
    return;
  }

  const proStatuses = ["active", "trialing"];

  const plan = proStatuses.includes(subscription.status) ? "pro" : "free";

  const periodEnd = subscriptionPeriodEnd(subscription);

  await pool.query(
    `
      UPDATE users
      SET
        plan = $1,
        stripe_customer_id = $2,
        stripe_subscription_id = $3,
        subscription_status = $4,
        subscription_current_period_end = $5,
        cancel_at_period_end = $6
      WHERE id = $7
    `,
    [
      plan,
      subscription.customer,
      subscription.id,
      subscription.status,
      periodEnd,
      subscription.cancel_at_period_end ?? false,
      userId,
    ],
  );

}

async function syncSubscriptionFromId(subscriptionId) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  await syncSubscription(subscription);
}

export async function verifyCheckoutSession(req, res) {
  try {
    const userId = req.session?.userId;
    const sessionId = req.query.session_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Checkout session ID is required.",
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const sessionUserId =
      session.client_reference_id || session.metadata?.userId;

    if (String(sessionUserId) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "This checkout session does not belong to this user.",
      });
    }

    if (session.mode !== "subscription") {
      return res.status(400).json({
        success: false,
        message: "Invalid checkout session.",
      });
    }

    if (session.status !== "complete") {
      return res.status(202).json({
        success: false,
        status: "pending",
        message: "Payment is still being processed.",
      });
    }

    let subscription = session.subscription;

    if (!subscription) {
      return res.status(202).json({
        success: false,
        status: "pending",
        message: "Subscription is still being created.",
      });
    }

    if (typeof subscription === "string") {
      subscription = await stripe.subscriptions.retrieve(subscription);
    }

    await syncSubscription(subscription);

    const result = await pool.query(
      `
        SELECT
          plan,
          subscription_status
        FROM users
        WHERE id = $1
      `,
      [userId],
    );

    const user = result.rows[0];

    return res.status(200).json({
      success: user?.plan === "pro",
      plan: user?.plan || "free",
      subscriptionStatus: user?.subscription_status || "inactive",
    });
  } catch (error) {
    console.error("Verify checkout session error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,
      message: "Unable to verify payment.",
    });
  }
}
export async function cancelSubscription(req, res) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          plan,
          stripe_subscription_id,
          subscription_status,
          cancel_at_period_end,
          subscription_current_period_end
        FROM users
        WHERE id = $1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = result.rows[0];

    if (!user.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: "No Stripe subscription found.",
      });
    }

    if (!["active", "trialing"].includes(user.subscription_status)) {
      return res.status(400).json({
        success: false,
        message: "No active subscription to cancel.",
      });
    }

    if (user.cancel_at_period_end) {
      return res.status(200).json({
        success: true,
        alreadyScheduled: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: user.subscription_current_period_end,
        message: "Your subscription is already scheduled for cancellation.",
      });
    }

    const subscription = await stripe.subscriptions.update(
      user.stripe_subscription_id,
      {
        cancel_at_period_end: true,
      },
    );

    await syncSubscription(subscription);

    return res.status(200).json({
      success: true,
      alreadyScheduled: false,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      message:
        "Your TripWise Pro subscription will cancel at the end of the current billing period.",
    });
  } catch (error) {
    console.error("Cancel subscription error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,
      message: "Unable to cancel subscription.",
    });
  }
}
export async function handleStripeWebhook(req, res) {
  const requestId = req.requestId || "unknown";
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      success: false,
      status: "error",
      message: "Missing Stripe signature.",
      requestId,
    });
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is missing.");

    return res.status(500).json({
      success: false,
      status: "error",
      message: "Webhook configuration error.",
      requestId,
    });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error("Stripe webhook verification failed:", { name: error?.name, code: error?.code });

    return res.status(400).send("Invalid webhook signature.");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        if (session.mode === "subscription" && session.subscription) {
          await syncSubscriptionFromId(session.subscription);
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;

        await syncSubscriptionFromId(subscription.id);

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        await syncSubscription(subscription);

        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object;

        const subscriptionId = invoice.parent?.subscription_details?.subscription || invoice.subscription;
        if (subscriptionId) {
          await syncSubscriptionFromId(typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id);
        }

        break;
      }

      default:
        break;
    }

    // Stripe only checks the HTTP status here, but keeps its own `received`
    // acknowledgement shape instead of the shared success/message envelope.
    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error("Stripe webhook processing error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      received: false,
    });
  }
}
export async function reactivateSubscription(req, res) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          plan,
          stripe_subscription_id,
          subscription_status,
          cancel_at_period_end
        FROM users
        WHERE id = $1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = result.rows[0];

    if (!user.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: "No Stripe subscription found.",
      });
    }

    if (!["active", "trialing"].includes(user.subscription_status)) {
      return res.status(400).json({
        success: false,
        message: "This subscription can no longer be reactivated.",
      });
    }

    if (!user.cancel_at_period_end) {
      return res.status(200).json({
        success: true,
        alreadyActive: true,
        cancelAtPeriodEnd: false,
        message: "Your TripWise Pro subscription is already active.",
      });
    }

    const subscription = await stripe.subscriptions.update(
      user.stripe_subscription_id,
      {
        cancel_at_period_end: false,
      },
    );

    await syncSubscription(subscription);

    return res.status(200).json({
      success: true,
      alreadyActive: false,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      message: "Your TripWise Pro subscription has been reactivated.",
    });
  } catch (error) {
    console.error("Reactivate subscription error:", { name: error?.name, code: error?.code });

    return res.status(500).json({
      success: false,
      message: "Unable to reactivate subscription.",
    });
  }
}