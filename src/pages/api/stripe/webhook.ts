import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { recordPurchase } from '../../../lib/db';
import { isValidSlug } from '../../../lib/modules';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      import.meta.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return new Response('Invalid signature', { status: 401 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const clerkUserId = session.metadata?.clerk_user_id;
    const moduleSlug = session.metadata?.module_slug;

    if (!clerkUserId || !moduleSlug || !isValidSlug(moduleSlug)) {
      return new Response('Missing metadata', { status: 400 });
    }

    await recordPurchase(clerkUserId, moduleSlug, session.id);
  }

  return new Response('ok', { status: 200 });
};
