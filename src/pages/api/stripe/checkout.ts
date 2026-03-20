import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { MODULES, isValidSlug, MODULE_SLUGS } from '../../../lib/modules';
import { getUserModules } from '../../../lib/db';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { userId } = locals.auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const formData = await request.formData();
  const moduleSlug = formData.get('module') as string;

  const isBundle = moduleSlug === 'bundle';

  if (!isBundle && (!moduleSlug || !isValidSlug(moduleSlug))) {
    return new Response('Invalid module', { status: 400 });
  }

  const owned = await getUserModules(userId);

  if (isBundle) {
    const allOwned = MODULE_SLUGS.every((s) => owned.includes(s));
    if (allOwned) {
      return redirect('/curso');
    }

    const priceId = import.meta.env.STRIPE_PRICE_BUNDLE;
    if (!priceId) {
      return new Response('Price not configured', { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        clerk_user_id: userId,
        module_slug: 'bundle',
      },
      success_url: `${new URL(request.url).origin}/curso`,
      cancel_url: `${new URL(request.url).origin}/curso`,
    });

    return redirect(session.url!, 303);
  }

  if (owned.includes(moduleSlug)) {
    return redirect('/curso');
  }

  const mod = MODULES[moduleSlug as keyof typeof MODULES];
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
