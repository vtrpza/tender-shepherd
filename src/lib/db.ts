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

/* ===== Admin queries ===== */

export interface PurchaseRow {
  clerk_user_id: string;
  module_slug: string;
  stripe_session_id: string;
  created_at: string;
}

export async function getRecentPurchases(limit: number): Promise<PurchaseRow[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT clerk_user_id, module_slug, stripe_session_id, created_at
    FROM purchases ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows as unknown as PurchaseRow[];
}

export interface PurchaseStats {
  totalStudents: number;
  totalPurchases: number;
  perModule: Record<string, number>;
}

export async function getPurchaseStats(): Promise<PurchaseStats> {
  const sql = getDb();
  const [studentsRow] = await sql`SELECT COUNT(DISTINCT clerk_user_id) AS count FROM purchases`;
  const [purchasesRow] = await sql`SELECT COUNT(*) AS count FROM purchases`;
  const moduleRows = await sql`
    SELECT module_slug, COUNT(*) AS count FROM purchases GROUP BY module_slug
  `;
  const perModule: Record<string, number> = {};
  for (const row of moduleRows) {
    perModule[row.module_slug as string] = Number(row.count);
  }
  return {
    totalStudents: Number(studentsRow.count),
    totalPurchases: Number(purchasesRow.count),
    perModule,
  };
}

export interface StudentRow {
  clerk_user_id: string;
  module_count: number;
  first_purchase: string;
}

export async function getStudentList(): Promise<StudentRow[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT clerk_user_id, COUNT(*) AS module_count, MIN(created_at) AS first_purchase
    FROM purchases GROUP BY clerk_user_id ORDER BY first_purchase DESC
  `;
  return rows as unknown as StudentRow[];
}

export async function getUserPurchaseDetails(clerkUserId: string): Promise<PurchaseRow[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT clerk_user_id, module_slug, stripe_session_id, created_at
    FROM purchases WHERE clerk_user_id = ${clerkUserId} ORDER BY created_at DESC
  `;
  return rows as unknown as PurchaseRow[];
}

export async function grantModuleAccess(clerkUserId: string, moduleSlug: string): Promise<void> {
  const sql = getDb();
  const sessionId = `admin-grant-${Date.now()}`;
  await sql`
    INSERT INTO purchases (clerk_user_id, module_slug, stripe_session_id)
    VALUES (${clerkUserId}, ${moduleSlug}, ${sessionId})
    ON CONFLICT (clerk_user_id, module_slug) DO NOTHING
  `;
}

export async function revokeModuleAccess(clerkUserId: string, moduleSlug: string): Promise<void> {
  const sql = getDb();
  await sql`
    DELETE FROM purchases WHERE clerk_user_id = ${clerkUserId} AND module_slug = ${moduleSlug}
  `;
}
