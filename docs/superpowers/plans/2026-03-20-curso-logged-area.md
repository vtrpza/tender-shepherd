# Course Logged Area — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a logged-in course area with Clerk auth, Stripe per-module payments, and Neon Postgres purchase storage — 3 modules with placeholder video lessons.

**Architecture:** Astro server mode with selective prerendering. Landing page and ebook stay static via `export const prerender = true`. Course pages are server-rendered behind Clerk middleware (auth) and page-level purchase gating (Neon DB). Stripe Checkout handles payments, webhook writes purchases.

**Tech Stack:** Astro 6, @clerk/astro, @astrojs/node, stripe, @neondatabase/serverless

**Spec:** `docs/superpowers/specs/2026-03-20-curso-logged-area-design.md`

---

## File Structure

```
New files:
  src/middleware.ts                    — Clerk auth, protects /curso/* routes
  src/lib/modules.ts                  — Module config map (slugs, names, prices, price env keys)
  src/lib/db.ts                       — Neon client, getUserModules(), recordPurchase()
  src/layouts/CursoLayout.astro       — Course layout (wraps Layout.astro, adds CursoTopbar)
  src/components/CursoTopbar.astro    — Course top bar (logo + UserButton + dashboard link)
  src/components/ModuleCard.astro     — Dashboard card (locked/unlocked states)
  src/components/Lesson.astro         — Reusable lesson block (video placeholder + notes + code)
  src/pages/sign-in/[...slug].astro   — Clerk sign-in page
  src/pages/sign-up/[...slug].astro   — Clerk sign-up page
  src/pages/curso/index.astro         — Dashboard (3 module cards, gated by auth only)
  src/pages/curso/trafego.astro       — Module 01 (5 lessons, gated by purchase)
  src/pages/curso/vendas.astro        — Module 02 (5 lessons, gated by purchase)
  src/pages/curso/financeiro.astro    — Module 03 (5 lessons, gated by purchase)
  src/pages/api/stripe/checkout.ts    — POST: creates Stripe Checkout Session
  src/pages/api/stripe/webhook.ts     — POST: handles checkout.session.completed
  .env.example                        — Template for required env vars

Modified files:
  astro.config.mjs                    — server mode + node adapter + clerk integration
  package.json                        — new dependencies (via npm install)
  src/pages/index.astro               — add export const prerender = true
  src/pages/ebook.astro               — add export const prerender = true
  CLAUDE.md                           — document src/lib/ convention + Clerk exception
```

---

### Task 1: Install dependencies and update Astro config

**Files:**
- Modify: `astro.config.mjs`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install new dependencies**

Run:
```bash
npm install @clerk/astro @astrojs/node stripe @neondatabase/serverless
```

Expected: packages install successfully, package.json updated with 4 new dependencies.

- [ ] **Step 2: Update astro.config.mjs**

Replace the entire file with:

```js
// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import clerk from '@clerk/astro';

export default defineConfig({
  integrations: [clerk()],
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  build: {
    inlineStylesheets: 'always',
  },
});
```

- [ ] **Step 3: Add prerender to index.astro**

In `src/pages/index.astro`, add `export const prerender = true;` inside the existing frontmatter block (after the last import line):

```astro
---
import Layout from '../layouts/Layout.astro';
import Topbar from '../components/Topbar.astro';
import Hero from '../components/Hero.astro';
import Stats from '../components/Stats.astro';
import Problem from '../components/Problem.astro';
import Pivot from '../components/Pivot.astro';
import Modules from '../components/Modules.astro';
import TechProof from '../components/TechProof.astro';
import Author from '../components/Author.astro';
import Pricing from '../components/Pricing.astro';
import FAQ from '../components/FAQ.astro';
import FinalCTA from '../components/FinalCTA.astro';
import Footer from '../components/Footer.astro';

export const prerender = true;
---
```

- [ ] **Step 4: Add prerender to ebook.astro**

In `src/pages/ebook.astro`, add `export const prerender = true;` inside the frontmatter block:

```astro
---
import EbookLayout from '../layouts/EbookLayout.astro';

export const prerender = true;
---
```

- [ ] **Step 5: Verify build compiles**

Run:
```bash
npm run build
```

Expected: Build succeeds. May show warnings about missing env vars — that's fine at this stage.

- [ ] **Step 6: Commit**

```bash
git add astro.config.mjs package.json package-lock.json src/pages/index.astro src/pages/ebook.astro
git commit -m "feat: switch to Astro server mode with Clerk and Node adapter

Existing pages pre-rendered for static performance."
```

---

### Task 2: Create environment template

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

```bash
# Clerk
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
PUBLIC_CLERK_SIGN_IN_URL=/sign-in
PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_TRAFEGO=price_...
STRIPE_PRICE_VENDAS=price_...
STRIPE_PRICE_FINANCEIRO=price_...

# Database (Neon)
DATABASE_URL=postgresql://...
```

- [ ] **Step 2: Verify .gitignore has .env**

Check that `.env` is in `.gitignore`. If not, add it.

- [ ] **Step 3: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add env template for Clerk, Stripe, and Neon"
```

---

### Task 3: Create database table

**Files:** None (database operation)

- [ ] **Step 1: Create the purchases table in Neon**

Use the Neon MCP tool `run_sql` (targeting the project connected via `DATABASE_URL` in `.env`) or the Neon dashboard to execute:

```sql
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  module_slug TEXT NOT NULL CHECK (module_slug IN ('trafego', 'vendas', 'financeiro')),
  stripe_session_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_user_module
  ON purchases (clerk_user_id, module_slug);
```

Expected: Table created with unique index. Verify by running `SELECT * FROM purchases;` — should return 0 rows.

---

### Task 4: Create module config and DB helpers

**Files:**
- Create: `src/lib/modules.ts`
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create src/lib/ directory and modules.ts**

```bash
mkdir -p src/lib
```

```ts
export const MODULES = {
  trafego: {
    name: 'Agente de Tráfego Autônomo',
    tagline: 'Meta Ads + Google Ads no piloto automático',
    number: '01',
    priceEnvKey: 'STRIPE_PRICE_TRAFEGO',
    displayPrice: 'R$97',
  },
  vendas: {
    name: 'Agente de Vendas & CRM',
    tagline: 'HubSpot + Pipedrive gerenciados por IA',
    number: '02',
    priceEnvKey: 'STRIPE_PRICE_VENDAS',
    displayPrice: 'R$97',
  },
  financeiro: {
    name: 'Agente Financeiro Inteligente',
    tagline: 'Extratos, DRE e alertas automáticos',
    number: '03',
    priceEnvKey: 'STRIPE_PRICE_FINANCEIRO',
    displayPrice: 'R$97',
  },
} as const;

export type ModuleSlug = keyof typeof MODULES;

export const MODULE_SLUGS = Object.keys(MODULES) as ModuleSlug[];

export function isValidSlug(slug: string): slug is ModuleSlug {
  return slug in MODULES;
}
```

- [ ] **Step 2: Create src/lib/db.ts**

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/modules.ts src/lib/db.ts
git commit -m "feat: add module config map and Neon DB helpers"
```

---

### Task 5: Create Clerk middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create src/middleware.ts**

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';

const isProtectedRoute = createRouteMatcher(['/curso(.*)']);

export const onRequest = clerkMiddleware((auth, context) => {
  const { isAuthenticated, redirectToSignIn } = auth();
  if (isProtectedRoute(context.request) && !isAuthenticated) {
    return redirectToSignIn();
  }
});
```

> **Note:** The webhook at `/api/stripe/webhook` is NOT matched by `/curso(.*)`, so Clerk middleware is a pass-through for it. No explicit exclusion needed — Stripe requests will flow through without auth checks.

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add Clerk middleware protecting /curso routes"
```

---

### Task 6: Create auth pages

**Files:**
- Create: `src/pages/sign-in/[...slug].astro`
- Create: `src/pages/sign-up/[...slug].astro`

- [ ] **Step 1: Create sign-in page**

Create `src/pages/sign-in/[...slug].astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import { SignIn } from '@clerk/astro/components';
---

<Layout title="Entrar — Empresa Autônoma">
  <div class="auth-page">
    <SignIn fallbackRedirectUrl="/curso" />
  </div>
</Layout>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
  }
</style>
```

- [ ] **Step 2: Create sign-up page**

Create `src/pages/sign-up/[...slug].astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import { SignUp } from '@clerk/astro/components';
---

<Layout title="Criar Conta — Empresa Autônoma">
  <div class="auth-page">
    <SignUp fallbackRedirectUrl="/curso" />
  </div>
</Layout>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
  }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/sign-in src/pages/sign-up
git commit -m "feat: add Clerk sign-in and sign-up pages"
```

---

### Task 7: Create CursoTopbar component

**Files:**
- Create: `src/components/CursoTopbar.astro`

- [ ] **Step 1: Create CursoTopbar.astro**

```astro
---
import { UserButton } from '@clerk/astro/components';
---

<header class="curso-topbar">
  <div class="curso-topbar-inner container-lg">
    <a href="/curso" class="curso-topbar-logo">
      <div class="wordmark">
        <span class="wordmark-top">EMPRESA</span>
        <span class="wordmark-bottom">AUTÔNOMA</span>
      </div>
    </a>
    <nav class="curso-topbar-nav">
      <a href="/curso" class="curso-topbar-link">Módulos</a>
      <UserButton />
    </nav>
  </div>
</header>

<style>
  .curso-topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(9, 9, 11, 0.92);
    backdrop-filter: blur(20px) saturate(120%);
    border-bottom: 1px solid var(--border);
    padding: 0 0;
  }
  .curso-topbar-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
  }
  .curso-topbar-logo {
    text-decoration: none;
    color: var(--text-primary);
  }
  .wordmark {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }
  .wordmark-top {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 4px;
    color: var(--accent);
  }
  .wordmark-bottom {
    font-family: 'Instrument Sans', sans-serif;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }
  .curso-topbar-nav {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .curso-topbar-link {
    font-size: 14px;
    color: var(--text-secondary);
    text-decoration: none;
    transition: color 0.2s;
  }
  .curso-topbar-link:hover {
    color: var(--text-primary);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CursoTopbar.astro
git commit -m "feat: add CursoTopbar component with Clerk UserButton"
```

---

### Task 8: Create CursoLayout

**Files:**
- Create: `src/layouts/CursoLayout.astro`

- [ ] **Step 1: Create CursoLayout.astro**

```astro
---
import Layout from './Layout.astro';
import CursoTopbar from '../components/CursoTopbar.astro';

interface Props {
  title?: string;
}
const { title = 'Curso — Empresa Autônoma' } = Astro.props;
---

<Layout title={title}>
  <CursoTopbar />
  <main class="curso-main">
    <slot />
  </main>
</Layout>

<style>
  .curso-main {
    max-width: var(--container);
    margin: 0 auto;
    padding: 40px clamp(20px, 4vw, 48px) 80px;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/layouts/CursoLayout.astro
git commit -m "feat: add CursoLayout wrapping Layout with course topbar"
```

---

### Task 9: Create ModuleCard component

**Files:**
- Create: `src/components/ModuleCard.astro`

- [ ] **Step 1: Create ModuleCard.astro**

```astro
---
interface Props {
  number: string;
  name: string;
  tagline: string;
  slug: string;
  locked: boolean;
  displayPrice: string;
}
const { number, name, tagline, slug, locked, displayPrice } = Astro.props;
---

<div class={`module-card ${locked ? 'module-card--locked' : ''}`}>
  <span class="module-badge mono">Módulo {number}</span>
  <h3 class="module-name">{name}</h3>
  <p class="module-tagline">{tagline}</p>
  {locked ? (
    <div class="module-locked-footer">
      <span class="module-price mono">{displayPrice}</span>
      <form method="POST" action={`/api/stripe/checkout`}>
        <input type="hidden" name="module" value={slug} />
        <button type="submit" class="btn btn-primary btn-sm">Comprar →</button>
      </form>
    </div>
  ) : (
    <a href={`/curso/${slug}`} class="btn btn-primary btn-sm">Acessar Módulo →</a>
  )}
</div>

<style>
  .module-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: all 0.3s ease;
  }
  .module-card:not(.module-card--locked):hover {
    border-color: var(--accent);
    transform: translateY(-4px);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  }
  .module-card--locked {
    opacity: 0.7;
  }
  .module-badge {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: var(--accent);
  }
  .module-name {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .module-tagline {
    font-size: 14px;
    color: var(--text-secondary);
    flex: 1;
  }
  .module-locked-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }
  .module-price {
    font-size: 24px;
    font-weight: 700;
    color: var(--accent);
  }
  .btn-sm {
    padding: 10px 20px;
    font-size: 14px;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ModuleCard.astro
git commit -m "feat: add ModuleCard component with locked/unlocked states"
```

---

### Task 10: Create Lesson component

**Files:**
- Create: `src/components/Lesson.astro`

- [ ] **Step 1: Create Lesson.astro**

```astro
---
interface Props {
  number: number;
  title: string;
  description: string;
  notes?: string;
  code?: string;
  codeLang?: string;
}
const { number, title, description, notes, code, codeLang = '' } = Astro.props;
---

<article class="lesson">
  <div class="lesson-header">
    <span class="lesson-badge mono">Aula {number}</span>
    <h3 class="lesson-title">{title}</h3>
    <p class="lesson-description">{description}</p>
  </div>

  <div class="lesson-video">
    <div class="video-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
      <span class="mono">Em breve</span>
    </div>
  </div>

  {notes && (
    <div class="lesson-notes">
      <Fragment set:html={notes} />
    </div>
  )}

  {code && (
    <div class="lesson-code">
      <pre><code class={codeLang}>{code}</code></pre>
    </div>
  )}
</article>

<style>
  .lesson {
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--bg-card);
    overflow: hidden;
  }
  .lesson + .lesson {
    margin-top: 32px;
  }
  .lesson-header {
    padding: 32px 32px 0;
  }
  .lesson-badge {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: var(--accent);
    display: block;
    margin-bottom: 8px;
  }
  .lesson-title {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .lesson-description {
    font-size: 15px;
    color: var(--text-secondary);
    line-height: 1.6;
  }
  .lesson-video {
    padding: 24px 32px;
  }
  .video-placeholder {
    aspect-ratio: 16/9;
    background: var(--bg-elevated);
    border: 1px dashed var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-muted);
  }
  .video-placeholder span {
    font-size: 13px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .lesson-notes {
    padding: 0 32px 24px;
    font-size: 15px;
    color: var(--text-secondary);
    line-height: 1.7;
  }
  .lesson-notes :global(p) {
    margin-bottom: 12px;
  }
  .lesson-notes :global(ul) {
    padding-left: 20px;
    margin-bottom: 12px;
  }
  .lesson-notes :global(li) {
    margin-bottom: 4px;
  }
  .lesson-notes :global(strong) {
    color: var(--text-primary);
  }
  .lesson-code {
    border-top: 1px solid var(--border);
    padding: 24px 32px;
  }
  .lesson-code pre {
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    overflow-x: auto;
    font-family: 'Geist Mono', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
  }
  @media (max-width: 640px) {
    .lesson-header, .lesson-video, .lesson-notes, .lesson-code {
      padding-left: 20px;
      padding-right: 20px;
    }
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Lesson.astro
git commit -m "feat: add Lesson component with video placeholder and notes"
```

---

### Task 11: Create curso dashboard page

**Files:**
- Create: `src/pages/curso/index.astro`

- [ ] **Step 1: Create the dashboard page**

```astro
---
import CursoLayout from '../../layouts/CursoLayout.astro';
import ModuleCard from '../../components/ModuleCard.astro';
import { MODULES, MODULE_SLUGS } from '../../lib/modules';
import { getUserModules } from '../../lib/db';

const { userId } = Astro.locals.auth();
const owned = userId ? await getUserModules(userId) : [];
---

<CursoLayout title="Meus Módulos — Empresa Autônoma">
  <section class="dashboard">
    <div class="dashboard-header">
      <p class="label">Área do aluno</p>
      <h1>Seus Módulos</h1>
      <p class="dashboard-sub">Escolha um módulo para começar a construir seus agentes de IA.</p>
    </div>
    <div class="dashboard-grid">
      {MODULE_SLUGS.map((slug) => (
        <ModuleCard
          number={MODULES[slug].number}
          name={MODULES[slug].name}
          tagline={MODULES[slug].tagline}
          slug={slug}
          locked={!owned.includes(slug)}
          displayPrice={MODULES[slug].displayPrice}
        />
      ))}
    </div>
  </section>
</CursoLayout>

<style>
  .dashboard-header {
    margin-bottom: 48px;
  }
  .dashboard-header h1 {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 800;
    letter-spacing: -1px;
    margin-top: 12px;
    margin-bottom: 12px;
  }
  .dashboard-sub {
    font-size: 16px;
    color: var(--text-secondary);
  }
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  @media (max-width: 900px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/curso/index.astro
git commit -m "feat: add curso dashboard page with module cards"
```

---

### Task 12: Create Stripe checkout API route

**Files:**
- Create: `src/pages/api/stripe/checkout.ts`

- [ ] **Step 1: Create the checkout endpoint**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/stripe/checkout.ts
git commit -m "feat: add Stripe checkout API route with form-based purchase flow"
```

---

### Task 13: Create Stripe webhook API route

**Files:**
- Create: `src/pages/api/stripe/webhook.ts`

- [ ] **Step 1: Create the webhook endpoint**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/stripe/webhook.ts
git commit -m "feat: add Stripe webhook handler for purchase recording"
```

---

### Task 14: Create Module 01 — Tráfego page

**Files:**
- Create: `src/pages/curso/trafego.astro`

- [ ] **Step 1: Create the tráfego module page**

```astro
---
import CursoLayout from '../../layouts/CursoLayout.astro';
import Lesson from '../../components/Lesson.astro';
import { getUserModules } from '../../lib/db';

const { userId } = Astro.locals.auth();
const owned = userId ? await getUserModules(userId) : [];
if (!owned.includes('trafego')) {
  return Astro.redirect('/curso');
}
---

<CursoLayout title="Módulo 01: Agente de Tráfego — Empresa Autônoma">
  <section class="module-page">
    <div class="module-header">
      <span class="label">Módulo 01</span>
      <h1>Agente de Tráfego Autônomo</h1>
      <p class="module-sub">Construa um agente que audita suas campanhas de Meta Ads e Google Ads, gera relatórios e dispara alertas — tudo no piloto automático.</p>
    </div>

    <div class="lessons">
      <Lesson
        number={1}
        title="Configurando o Claude Code"
        description="Instale o Claude Code, configure o ambiente e escreva seu primeiro CLAUDE.md — o arquivo que diz ao agente como se comportar no seu projeto."
        notes={`
          <p>Nesta aula você vai:</p>
          <ul>
            <li>Instalar o Claude Code via terminal</li>
            <li>Entender a estrutura de um projeto com <strong>CLAUDE.md</strong></li>
            <li>Configurar permissões e comandos personalizados</li>
            <li>Rodar seu primeiro prompt no modo interativo</li>
          </ul>
        `}
        code={`# Instalar Claude Code
npm install -g @anthropic-ai/claude-code

# Iniciar no seu projeto
cd meu-projeto
claude

# Ou rodar um comando direto (modo headless)
claude -p "Analise a estrutura deste projeto"`}
        codeLang="bash"
      />

      <Lesson
        number={2}
        title="Conectando Meta Ads e Google Ads via MCP"
        description="Configure servidores MCP que dão ao seu agente acesso direto às APIs do Meta Ads e Google Ads — sem precisar escrever código de integração."
        notes={`
          <p>O <strong>Model Context Protocol (MCP)</strong> permite conectar o Claude Code a ferramentas externas via servidores padronizados.</p>
          <p>Você vai aprender a:</p>
          <ul>
            <li>Configurar o arquivo <strong>.mcp.json</strong> no seu projeto</li>
            <li>Conectar ao servidor MCP do Meta Ads (campanhas, ad sets, métricas)</li>
            <li>Conectar ao servidor MCP do Google Ads (keywords, quality score, CPC)</li>
            <li>Testar as conexões com prompts simples</li>
          </ul>
        `}
        code={`// .mcp.json — Configuração dos servidores MCP
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "mcp-meta-ads"],
      "env": {
        "META_ACCESS_TOKEN": "seu-token",
        "META_AD_ACCOUNT_ID": "act_123456"
      }
    },
    "google-ads": {
      "command": "npx",
      "args": ["-y", "mcp-google-ads"],
      "env": {
        "GOOGLE_ADS_DEVELOPER_TOKEN": "seu-token",
        "GOOGLE_ADS_CUSTOMER_ID": "123-456-7890"
      }
    }
  }
}`}
        codeLang="json"
      />

      <Lesson
        number={3}
        title="Construindo o Agente de Auditoria"
        description="Crie o agente que analisa CPA, ROAS, custo por keyword e identifica desperdício — usando comandos personalizados do Claude Code."
        notes={`
          <p>Aqui é onde a mágica acontece. Você vai criar um <strong>comando personalizado</strong> que o agente executa para auditar todas as suas campanhas de uma vez.</p>
          <ul>
            <li>Criar o arquivo de comando em <strong>.claude/commands/audit-ads.md</strong></li>
            <li>Definir os critérios de auditoria (CPA acima do limite, ROAS abaixo do mínimo, keywords com quality score baixo)</li>
            <li>Gerar um relatório estruturado com recomendações</li>
            <li>Testar com dados reais da sua conta</li>
          </ul>
        `}
        code={`# .claude/commands/audit-ads.md

Analise todas as campanhas ativas nas contas Meta Ads e Google Ads.

Para cada campanha, avalie:
- CPA vs. meta (flag se > 20% acima)
- ROAS vs. mínimo de 3x (flag se abaixo)
- Keywords com Quality Score < 5 no Google Ads
- Ad sets com frequência > 3 no Meta Ads

Gere um relatório com:
1. Resumo executivo (3 linhas)
2. Campanhas com problema (tabela)
3. Top 5 recomendações de ação imediata`}
        codeLang="markdown"
      />

      <Lesson
        number={4}
        title="Relatórios PDF Automatizados"
        description="Configure o agente para gerar relatórios em PDF diariamente via cron — sem precisar abrir o computador."
        notes={`
          <p>Você vai configurar uma <strong>automação completa</strong> que roda todos os dias às 8h:</p>
          <ul>
            <li>Criar um script shell que invoca o Claude Code em modo headless</li>
            <li>Gerar o relatório em formato Markdown</li>
            <li>Converter para PDF com formatação profissional</li>
            <li>Configurar o cron job no servidor</li>
          </ul>
        `}
        code={`#!/bin/bash
# audit-daily.sh — Roda a auditoria diária

cd /home/user/meu-projeto

# Gera o relatório via Claude Code (headless)
claude -p "/audit-ads" --output report.md

# Converte para PDF
npx md-to-pdf report.md

# Move para pasta de relatórios
mv report.pdf reports/audit-$(date +%Y-%m-%d).pdf

echo "Relatório gerado: audit-$(date +%Y-%m-%d).pdf"`}
        codeLang="bash"
      />

      <Lesson
        number={5}
        title="Sistema de Alertas"
        description="Configure alertas automáticos via Slack ou WhatsApp quando métricas saem do padrão — o agente avisa você antes do prejuízo."
        notes={`
          <p>O sistema de alertas é a última camada de automação. Quando o agente detecta anomalias, ele notifica você instantaneamente.</p>
          <ul>
            <li>Configurar webhook do Slack para receber alertas</li>
            <li>Definir thresholds de alerta (CPA, ROAS, budget burn rate)</li>
            <li>Criar o comando de monitoramento contínuo</li>
            <li>Integrar com WhatsApp via API do Twilio (opcional)</li>
          </ul>
        `}
        code={`# .claude/commands/monitor-alerts.md

Verifique as métricas das últimas 4 horas em todas as campanhas.

Dispare alerta via webhook se:
- CPA subiu mais de 30% vs. média dos últimos 7 dias
- Budget diário consumido > 80% antes das 14h
- ROAS caiu abaixo de 2x em qualquer campanha
- Qualquer campanha pausada automaticamente pela plataforma

Formato do alerta:
🚨 [PLATAFORMA] Campanha: NOME
Métrica: VALOR_ATUAL vs. LIMITE
Ação sugerida: RECOMENDAÇÃO`}
        codeLang="markdown"
      />
    </div>
  </section>
</CursoLayout>

<style>
  .module-header {
    margin-bottom: 48px;
  }
  .module-header h1 {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 800;
    letter-spacing: -1px;
    margin-top: 12px;
    margin-bottom: 12px;
  }
  .module-sub {
    font-size: 16px;
    color: var(--text-secondary);
    max-width: 640px;
    line-height: 1.6;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/curso/trafego.astro
git commit -m "feat: add Module 01 (Tráfego) page with 5 lessons"
```

---

### Task 15: Create Module 02 — Vendas page

**Files:**
- Create: `src/pages/curso/vendas.astro`

- [ ] **Step 1: Create the vendas module page**

```astro
---
import CursoLayout from '../../layouts/CursoLayout.astro';
import Lesson from '../../components/Lesson.astro';
import { getUserModules } from '../../lib/db';

const { userId } = Astro.locals.auth();
const owned = userId ? await getUserModules(userId) : [];
if (!owned.includes('vendas')) {
  return Astro.redirect('/curso');
}
---

<CursoLayout title="Módulo 02: Agente de Vendas — Empresa Autônoma">
  <section class="module-page">
    <div class="module-header">
      <span class="label">Módulo 02</span>
      <h1>Agente de Vendas & CRM</h1>
      <p class="module-sub">Construa um agente que classifica leads, gera follow-ups, monitora seu pipeline e produz forecasts semanais — direto do seu CRM.</p>
    </div>

    <div class="lessons">
      <Lesson
        number={1}
        title="Conectando HubSpot e Pipedrive via MCP"
        description="Configure os servidores MCP que dão ao agente acesso ao seu CRM — leitura e escrita de contatos, deals e atividades."
        notes={`
          <p>O primeiro passo é dar ao agente acesso ao seu CRM sem escrever integrações do zero.</p>
          <ul>
            <li>Configurar o servidor MCP do HubSpot (contatos, deals, empresas, atividades)</li>
            <li>Configurar o servidor MCP do Pipedrive (leads, deals, pipeline stages)</li>
            <li>Testar operações de leitura (listar deals abertos, buscar contato)</li>
            <li>Testar operações de escrita (criar nota, atualizar stage)</li>
          </ul>
        `}
        code={`// .mcp.json — Configuração do CRM
{
  "mcpServers": {
    "hubspot": {
      "command": "npx",
      "args": ["-y", "mcp-hubspot"],
      "env": {
        "HUBSPOT_ACCESS_TOKEN": "pat-na1-xxx"
      }
    },
    "pipedrive": {
      "command": "npx",
      "args": ["-y", "mcp-pipedrive"],
      "env": {
        "PIPEDRIVE_API_TOKEN": "xxx",
        "PIPEDRIVE_DOMAIN": "suaempresa"
      }
    }
  }
}`}
        codeLang="json"
      />

      <Lesson
        number={2}
        title="Motor de Classificação de Leads"
        description="Crie o sistema de scoring que classifica leads em quente, morno e frio com base no comportamento e dados do CRM."
        notes={`
          <p>O agente vai analisar cada lead novo e atribuir uma temperatura baseada em critérios que você define:</p>
          <ul>
            <li>Definir critérios de scoring (cargo, tamanho da empresa, engajamento, tempo no pipeline)</li>
            <li>Criar o comando de classificação em <strong>.claude/commands/classify-leads.md</strong></li>
            <li>Rodar a classificação em batch para todos os leads sem score</li>
            <li>Atualizar o campo de temperatura no CRM automaticamente</li>
          </ul>
        `}
        code={`# .claude/commands/classify-leads.md

Analise todos os leads sem classificação no CRM.

Critérios de scoring:
- QUENTE (>70 pontos): decisor (C-level/diretor), empresa >50 funcionários,
  interagiu nos últimos 7 dias, abriu proposta
- MORNO (40-70): gerente/coordenador, empresa 10-50 funcionários,
  interagiu nos últimos 30 dias
- FRIO (<40): analista/assistente, empresa <10 funcionários,
  sem interação há mais de 30 dias

Para cada lead:
1. Calcule o score baseado nos critérios
2. Classifique como QUENTE/MORNO/FRIO
3. Atualize o campo "temperatura" no CRM
4. Adicione uma nota com a justificativa`}
        codeLang="markdown"
      />

      <Lesson
        number={3}
        title="Follow-ups Automáticos"
        description="Configure o agente para gerar mensagens de follow-up personalizadas baseadas no contexto de cada deal."
        notes={`
          <p>Esqueça templates genéricos. O agente lê o histórico do deal e gera uma mensagem <strong>contextual</strong>:</p>
          <ul>
            <li>Criar o comando de geração de follow-up</li>
            <li>Definir regras por stage do pipeline (primeiro contato, proposta enviada, negociação)</li>
            <li>Gerar mensagens para WhatsApp e email</li>
            <li>Salvar os rascunhos como atividades no CRM</li>
          </ul>
        `}
        code={`# .claude/commands/generate-followups.md

Para cada deal que não teve interação nos últimos 5 dias úteis:

1. Leia o histórico completo (notas, emails, atividades)
2. Identifique o stage atual e o contexto da última interação
3. Gere uma mensagem de follow-up personalizada:
   - Tom: profissional mas humano
   - Referência à última conversa
   - Próximo passo claro (reunião, demo, decisão)
   - Máximo 4 linhas para WhatsApp, 8 para email

4. Salve como nota no deal com tag "follow-up-ia"
5. Liste todos os follow-ups gerados em um resumo`}
        codeLang="markdown"
      />

      <Lesson
        number={4}
        title="Monitoramento de Pipeline + Alertas"
        description="Configure alertas para deals parados, oportunidades em risco e mudanças suspeitas no pipeline."
        notes={`
          <p>O agente monitora seu pipeline e avisa quando algo precisa de atenção:</p>
          <ul>
            <li>Detectar deals parados (sem movimentação no stage por X dias)</li>
            <li>Identificar deals em risco (valor alto + sem interação recente)</li>
            <li>Alertar sobre deals que regrediram de stage</li>
            <li>Enviar resumo diário via Slack com os deals que precisam de ação</li>
          </ul>
        `}
        code={`# .claude/commands/pipeline-monitor.md

Analise todos os deals abertos no pipeline e identifique:

DEALS PARADOS:
- Qualquer deal no mesmo stage há mais de 14 dias
- Priorize por valor (maior valor = mais urgente)

DEALS EM RISCO:
- Valor > R$5.000 sem interação nos últimos 10 dias
- Deals com data de fechamento prevista nos próximos 7 dias

REGRESSÕES:
- Deals que voltaram para um stage anterior esta semana

Gere o alerta via webhook do Slack com formato:
📊 Pipeline Daily | [DATA]
🔴 X deals parados | 🟡 X em risco | ⬇️ X regressões
[Lista detalhada com links para cada deal]`}
        codeLang="markdown"
      />

      <Lesson
        number={5}
        title="Forecast Semanal com Entrega por Email"
        description="Automatize a geração de um relatório de previsão de receita semanal, entregue por email toda segunda-feira."
        notes={`
          <p>Todo gestor precisa de visibilidade. O agente gera um forecast realista baseado no estado atual do pipeline:</p>
          <ul>
            <li>Calcular receita prevista por stage (com pesos de probabilidade)</li>
            <li>Comparar com a meta mensal/trimestral</li>
            <li>Identificar os deals que mais impactam o resultado</li>
            <li>Gerar relatório Markdown → PDF e enviar por email</li>
          </ul>
        `}
        code={`#!/bin/bash
# forecast-weekly.sh — Roda toda segunda às 7h

cd /home/user/meu-projeto

# Gera o forecast via Claude Code
claude -p "/forecast-pipeline" --output forecast.md

# Converte para PDF
npx md-to-pdf forecast.md

# Envia por email (via sendgrid/ses)
node scripts/send-email.js \\
  --to "gestor@empresa.com" \\
  --subject "Forecast Semanal — $(date +%d/%m/%Y)" \\
  --attachment forecast.pdf

echo "Forecast enviado: $(date +%Y-%m-%d)"`}
        codeLang="bash"
      />
    </div>
  </section>
</CursoLayout>

<style>
  .module-header {
    margin-bottom: 48px;
  }
  .module-header h1 {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 800;
    letter-spacing: -1px;
    margin-top: 12px;
    margin-bottom: 12px;
  }
  .module-sub {
    font-size: 16px;
    color: var(--text-secondary);
    max-width: 640px;
    line-height: 1.6;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/curso/vendas.astro
git commit -m "feat: add Module 02 (Vendas) page with 5 lessons"
```

---

### Task 16: Create Module 03 — Financeiro page

**Files:**
- Create: `src/pages/curso/financeiro.astro`

- [ ] **Step 1: Create the financeiro module page**

```astro
---
import CursoLayout from '../../layouts/CursoLayout.astro';
import Lesson from '../../components/Lesson.astro';
import { getUserModules } from '../../lib/db';

const { userId } = Astro.locals.auth();
const owned = userId ? await getUserModules(userId) : [];
if (!owned.includes('financeiro')) {
  return Astro.redirect('/curso');
}
---

<CursoLayout title="Módulo 03: Agente Financeiro — Empresa Autônoma">
  <section class="module-page">
    <div class="module-header">
      <span class="label">Módulo 03</span>
      <h1>Agente Financeiro Inteligente</h1>
      <p class="module-sub">Construa um agente que processa extratos bancários, categoriza despesas, gera DRE e detecta anomalias — seu auxiliar financeiro 24/7.</p>
    </div>

    <div class="lessons">
      <Lesson
        number={1}
        title="Processando Extratos Bancários"
        description="Configure o agente para ler e interpretar extratos em CSV e OFX — os formatos mais comuns dos bancos brasileiros."
        notes={`
          <p>O primeiro passo é ensinar o agente a ler os dados financeiros da sua empresa:</p>
          <ul>
            <li>Entender os formatos CSV e OFX (Open Financial Exchange)</li>
            <li>Configurar o parsing de extratos dos principais bancos (Itaú, Bradesco, Nubank, Inter)</li>
            <li>Normalizar os dados: data, descrição, valor, tipo (crédito/débito)</li>
            <li>Criar o comando de importação em <strong>.claude/commands/import-statement.md</strong></li>
          </ul>
        `}
        code={`# .claude/commands/import-statement.md

Leia o arquivo de extrato fornecido e normalize os dados.

Formatos suportados:
- CSV (separador ; ou ,) com colunas: Data, Descrição, Valor
- OFX (XML do Open Financial Exchange)

Para cada transação, extraia:
1. Data (formato YYYY-MM-DD)
2. Descrição original do banco
3. Valor (positivo = entrada, negativo = saída)
4. Tipo: CREDITO ou DEBITO

Salve o resultado em data/transacoes-YYYY-MM.json
Reporte: X transações importadas, período de DD/MM a DD/MM`}
        codeLang="markdown"
      />

      <Lesson
        number={2}
        title="Categorização Inteligente de Despesas"
        description="Use IA para categorizar cada transação automaticamente — e aprenda a treinar o agente com as categorias da sua empresa."
        notes={`
          <p>Em vez de categorizar centenas de transações manualmente, o agente faz isso em segundos:</p>
          <ul>
            <li>Definir suas categorias (Pessoal, Marketing, Infraestrutura, Salários, Impostos, etc.)</li>
            <li>Criar regras de categorização (regex + IA)</li>
            <li>O agente aprende com correções — melhora a cada mês</li>
            <li>Gerar relatório de categorização com % de confiança</li>
          </ul>
        `}
        code={`# .claude/commands/categorize-expenses.md

Categorize todas as transações não-categorizadas do mês atual.

Categorias disponíveis:
- RECEITA: vendas, serviços, reembolsos
- PESSOAL: salários, benefícios, FGTS, INSS
- MARKETING: ads, ferramentas, eventos
- INFRA: hosting, SaaS, domínios, telefonia
- IMPOSTOS: DAS, ISS, IRPJ, CSLL
- OPERACIONAL: escritório, transporte, alimentação
- FINANCEIRO: juros, tarifas bancárias, IOF

Para cada transação:
1. Analise a descrição e o valor
2. Atribua a categoria mais provável
3. Adicione nível de confiança (ALTA/MÉDIA/BAIXA)
4. Transações com confiança BAIXA vão para revisão manual

Salve em data/categorizado-YYYY-MM.json
Resumo: X categorizadas (Y% alta confiança, Z% para revisão)`}
        codeLang="markdown"
      />

      <Lesson
        number={3}
        title="Gerando DRE e Fluxo de Caixa"
        description="Automatize a geração da DRE (Demonstração do Resultado) e do fluxo de caixa mensal — relatórios que seu contador vai amar."
        notes={`
          <p>Com as transações categorizadas, gerar os relatórios financeiros é automático:</p>
          <ul>
            <li>Gerar DRE simplificada (receitas - deduções - custos - despesas = resultado)</li>
            <li>Gerar fluxo de caixa mensal (entradas vs. saídas por categoria)</li>
            <li>Comparar com meses anteriores (variação %)</li>
            <li>Exportar em PDF formatado para enviar ao contador</li>
          </ul>
        `}
        code={`# .claude/commands/generate-dre.md

Gere a DRE e o Fluxo de Caixa do mês especificado.

DRE SIMPLIFICADA:
(+) Receita Bruta
(-) Deduções (impostos sobre receita)
(=) Receita Líquida
(-) Custos (pessoal, infra)
(=) Lucro Bruto
(-) Despesas Operacionais (marketing, operacional)
(-) Despesas Financeiras (juros, tarifas)
(=) Resultado do Exercício

FLUXO DE CAIXA:
- Entradas por categoria
- Saídas por categoria
- Saldo do mês
- Saldo acumulado

Inclua variação % vs. mês anterior.
Exporte como Markdown formatado para conversão em PDF.`}
        codeLang="markdown"
      />

      <Lesson
        number={4}
        title="Detecção de Anomalias e Alertas"
        description="Configure o agente para detectar gastos fora do padrão e enviar alertas antes que virem problemas."
        notes={`
          <p>O agente monitora seus gastos e identifica anomalias automaticamente:</p>
          <ul>
            <li>Definir baselines por categoria (média dos últimos 3 meses)</li>
            <li>Detectar transações individuais acima do normal</li>
            <li>Detectar categorias com gasto acumulado acima do orçamento</li>
            <li>Enviar alerta via Slack/email quando anomalia é detectada</li>
          </ul>
        `}
        code={`# .claude/commands/detect-anomalies.md

Analise as transações do mês corrente vs. a média dos últimos 3 meses.

ANOMALIAS INDIVIDUAIS:
- Qualquer transação > 3x a média de transações na mesma categoria
- Transações em categorias novas (nunca vistas antes)
- Transações duplicadas (mesmo valor + descrição em 48h)

ANOMALIAS DE CATEGORIA:
- Categoria com gasto acumulado > 150% da média trimestral
- Categoria com crescimento > 50% vs. mês anterior

Para cada anomalia detectada:
1. Descrição da transação/categoria
2. Valor atual vs. valor esperado
3. Nível: 🔴 CRÍTICO (>200%) | 🟡 ATENÇÃO (>150%)
4. Sugestão de ação

Envie alerta via webhook se houver anomalias CRÍTICAS.`}
        codeLang="markdown"
      />

      <Lesson
        number={5}
        title="Dashboard HTML + Automação Semanal"
        description="Gere um dashboard interativo em HTML e configure a automação completa que roda toda semana."
        notes={`
          <p>A cereja do bolo: um dashboard visual que você abre no navegador e uma automação que roda sozinha:</p>
          <ul>
            <li>Gerar um arquivo HTML com gráficos (receitas vs. despesas, breakdown por categoria)</li>
            <li>Usar Chart.js via CDN para gráficos interativos</li>
            <li>Configurar cron job semanal: importar → categorizar → relatório → dashboard → email</li>
            <li>O fluxo completo roda em menos de 2 minutos</li>
          </ul>
        `}
        code={`#!/bin/bash
# finance-weekly.sh — Pipeline financeiro semanal (sexta às 18h)

cd /home/user/meu-projeto

echo "1/5 Importando extratos..."
claude -p "/import-statement extratos/$(date +%Y-%m).csv"

echo "2/5 Categorizando transações..."
claude -p "/categorize-expenses"

echo "3/5 Gerando DRE e fluxo de caixa..."
claude -p "/generate-dre $(date +%Y-%m)" --output reports/dre.md
npx md-to-pdf reports/dre.md

echo "4/5 Verificando anomalias..."
claude -p "/detect-anomalies"

echo "5/5 Gerando dashboard..."
claude -p "Gere um dashboard HTML com Chart.js mostrando:
- Gráfico de barras: receitas vs despesas (últimos 6 meses)
- Gráfico de pizza: despesas por categoria (mês atual)
- Tabela: top 10 maiores despesas do mês
Salve em reports/dashboard.html"

echo "Pipeline completo: $(date)"`}
        codeLang="bash"
      />
    </div>
  </section>
</CursoLayout>

<style>
  .module-header {
    margin-bottom: 48px;
  }
  .module-header h1 {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 800;
    letter-spacing: -1px;
    margin-top: 12px;
    margin-bottom: 12px;
  }
  .module-sub {
    font-size: 16px;
    color: var(--text-secondary);
    max-width: 640px;
    line-height: 1.6;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/curso/financeiro.astro
git commit -m "feat: add Module 03 (Financeiro) page with 5 lessons"
```

---

### Task 17: Update CLAUDE.md and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md with new conventions**

Add the following after the existing "Key Files" section:

```markdown
## New Conventions (Course Area)

- `src/lib/` directory contains shared TypeScript modules (db helpers, config maps). This is a new convention — landing page components don't use it.
- Clerk's `@clerk/astro` integration injects client-side JS for auth UI components (`<UserButton />`, `<SignIn />`, `<SignUp />`). This is an accepted exception to the "no React/Vue/Svelte" constraint — Clerk manages its own runtime internally.
- Course pages (`/curso/*`) are server-rendered. Landing page and ebook stay static via `export const prerender = true`.
- Module purchase gating is page-level (in frontmatter), not middleware-level. Middleware only handles Clerk auth.
```

- [ ] **Step 2: Run full build**

```bash
npm run build
```

Expected: Build succeeds. Course pages are server-rendered, landing page and ebook are pre-rendered.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with course area conventions"
```

---

### Task 18: Smoke test with dev server

- [ ] **Step 1: Create .env with test values**

Copy `.env.example` to `.env` and fill in real Clerk test keys + Neon connection string. Stripe keys can be test mode.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Verify public pages**

- Visit `http://localhost:4321/` — landing page should render as before
- Visit `http://localhost:4321/ebook` — ebook should render as before

- [ ] **Step 4: Verify auth flow**

- Visit `http://localhost:4321/curso` — should redirect to `/sign-in`
- Sign in with Clerk test account — should redirect to `/curso` dashboard
- Dashboard should show 3 module cards, all locked

- [ ] **Step 5: Verify purchase gating**

- Click a locked module — should go to the module page OR redirect back to dashboard (depending on Stripe config)
- Directly visit `http://localhost:4321/curso/trafego` — should redirect to `/curso` (no purchase)

- [ ] **Step 6: Verify Stripe checkout**

- Click "Comprar" on a module card — should redirect to Stripe Checkout (test mode)
- Complete test payment — webhook should fire, purchase recorded in Neon
- Return to `/curso` — module should now show as unlocked
- Click "Acessar Módulo" — module page should render with all 5 lessons
