import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { MODULES, isValidSlug } from '../../../lib/modules';
import { getUserModules } from '../../../lib/db';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { userId } = locals.auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const formData = await request.formData();
  const moduleSlug = formData.get('module') as string;

  if (!moduleSlug || !isValidSlug(moduleSlug)) {
    return new Response('Invalid module', { status: 400 });
  }

  const owned = await getUserModules(userId);
  if (owned.includes(moduleSlug)) {
    return redirect('/curso');
  }

  const mod = MODULES[moduleSlug];
  const priceId = import.meta.env[mod.priceEnvKey];

  if (!priceId) {
    return new Response('Price not configured', { status: 500 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      clerk_user_id: userId,
      module_slug: moduleSlug,
    },
    success_url: `${new URL(request.url).origin}/curso`,
    cancel_url: `${new URL(request.url).origin}/curso`,
  });

  return redirect(session.url!, 303);
};
