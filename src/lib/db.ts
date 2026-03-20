import { neon } from '@neondatabase/serverless';

function getDb() {
  const sql = neon(import.meta.env.DATABASE_URL);
  return sql;
}

export async function getUserModules(clerkUserId: string): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT module_slug FROM purchases WHERE clerk_user_id = ${clerkUserId}
  `;
  return rows.map((r) => r.module_slug as string);
}

export async function recordPurchase(
  clerkUserId: string,
  moduleSlug: string,
  stripeSessionId: string,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO purchases (clerk_user_id, module_slug, stripe_session_id)
    VALUES (${clerkUserId}, ${moduleSlug}, ${stripeSessionId})
    ON CONFLICT (clerk_user_id, module_slug) DO NOTHING
  `;
}

export async function recordBundlePurchase(
  clerkUserId: string,
  stripeSessionId: string,
  slugs: string[],
): Promise<void> {
  const sql = getDb();
  for (const slug of slugs) {
    await sql`
      INSERT INTO purchases (clerk_user_id, module_slug, stripe_session_id)
      VALUES (${clerkUserId}, ${slug}, ${stripeSessionId + '-' + slug})
      ON CONFLICT (clerk_user_id, module_slug) DO NOTHING
    `;
  }
}
