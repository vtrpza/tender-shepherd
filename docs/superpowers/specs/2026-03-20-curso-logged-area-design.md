# Course Logged Area — Design Spec

## Overview

Scaffold a logged-in course area for "Empresa Autonoma" with 3 independently purchasable modules, Clerk authentication, Stripe payments, and Neon Postgres for purchase records. The existing static landing page and ebook remain unchanged.

## Architecture Decision

**Astro server mode with selective prerendering** — use `output: 'server'` (as recommended by Clerk docs) with `export const prerender = true` on the landing page and ebook to keep them static. Course pages (`/curso/*`) are server-rendered with Clerk auth and module-level gating via Stripe purchases stored in Neon Postgres.

**Deployment model change:** The project moves from static hosting to a Node.js server (`@astrojs/node` standalone mode). Deployment target (Railway, Fly.io, Docker, etc.) is out of scope for this spec but must be decided before launch. The webhook endpoint needs a publicly reachable URL for Stripe.

**Compatibility note:** `@clerk/astro` must be verified against Astro 6 (`^6.0.7`) before implementation. Check `peerDependencies` on install — if incompatible, evaluate pinning Astro or using Clerk's vanilla JS SDK as a fallback.

## Dependencies

New packages:
- `@clerk/astro` — Clerk integration for Astro (includes client-side JS for UI components like `<UserButton />` — this is an accepted exception to the "no React/Vue/Svelte" convention since it's managed internally by Clerk's Astro integration, not a project-level framework dependency)
- `@astrojs/node` — Node adapter for server-rendered pages
- `stripe` — Stripe Node SDK
- `@neondatabase/serverless` — Neon serverless driver

Environment variables:
- `PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_TRAFEGO` — Stripe price ID for Module 01
- `STRIPE_PRICE_VENDAS` — Stripe price ID for Module 02
- `STRIPE_PRICE_FINANCEIRO` — Stripe price ID for Module 03
- `DATABASE_URL` (Neon connection string)

## Routing & Page Structure

### Public pages (static, pre-rendered via `export const prerender = true`)
- `/` — landing page (unchanged)
- `/ebook` — free guide (unchanged)

### Auth pages (Clerk-hosted UI)
- `/sign-in` — Clerk sign-in (redirects to `/curso` after sign-in via `afterSignInUrl`)
- `/sign-up` — Clerk sign-up (redirects to `/curso` after sign-up via `afterSignUpUrl`)

### Protected pages (server-rendered, behind Clerk auth)
- `/curso` — dashboard showing 3 module cards (locked/unlocked based on purchases)
- `/curso/trafego` — Module 01 vertical scroll (5 lessons), gated by purchase
- `/curso/vendas` — Module 02 vertical scroll (5 lessons), gated by purchase
- `/curso/financeiro` — Module 03 vertical scroll (5 lessons), gated by purchase

## Astro Configuration

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import clerk from '@clerk/astro'

export default defineConfig({
  integrations: [clerk()],
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  build: { inlineStylesheets: 'always' },
})
```

Existing static pages (`index.astro`, `ebook.astro`) get `export const prerender = true` to stay static.

## Database Schema

Single table in Neon Postgres:

```sql
CREATE TABLE purchases (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  module_slug TEXT NOT NULL CHECK (module_slug IN ('trafego', 'vendas', 'financeiro')),
  stripe_session_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_purchases_user_module ON purchases (clerk_user_id, module_slug);
```

The unique index on `(clerk_user_id, module_slug)` prevents duplicate purchases.

## Module Gating Model

- Each module is a separate Stripe product with its own price
- Price IDs are configured via environment variables: `STRIPE_PRICE_TRAFEGO`, `STRIPE_PRICE_VENDAS`, `STRIPE_PRICE_FINANCEIRO`
- Users can buy 1, 2, or all 3 modules independently
- The `/curso` dashboard shows all 3 modules, visually distinguishing owned vs locked
- Locked modules show price + "Comprar" button
- Owned modules show "Acessar Modulo" link

### Module config map

```ts
// src/lib/modules.ts
export const MODULES = {
  trafego: {
    name: 'Agente de Trafego Autonomo',
    priceEnvKey: 'STRIPE_PRICE_TRAFEGO',
    displayPrice: 'R$ 297', // hardcoded display price for UI
  },
  vendas: {
    name: 'Agente de Vendas & CRM',
    priceEnvKey: 'STRIPE_PRICE_VENDAS',
    displayPrice: 'R$ 297',
  },
  financeiro: {
    name: 'Agente Financeiro Inteligente',
    priceEnvKey: 'STRIPE_PRICE_FINANCEIRO',
    displayPrice: 'R$ 297',
  },
} as const

export type ModuleSlug = keyof typeof MODULES
```

## Request Flows

### Auth gating (middleware)

The Clerk middleware handles authentication only. It protects `/curso/*` routes and redirects unauthenticated users to `/sign-in`. It does NOT handle purchase gating.

```ts
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server'

const isProtectedRoute = createRouteMatcher(['/curso(.*)'])

export const onRequest = clerkMiddleware((auth, context) => {
  if (isProtectedRoute(context.request) && !auth().isAuthenticated) {
    return auth().redirectToSignIn()
  }
})
```

### Purchase gating (page-level)

Each module page checks purchase entitlement in its own frontmatter using `Astro.locals.auth()` to get the `userId`, then querying Neon. This follows Clerk's documented patterns and avoids DB queries in middleware for every request.

```astro
---
// e.g. src/pages/curso/vendas.astro (frontmatter)
import { getUserModules } from '../../lib/db'

const { userId } = Astro.locals.auth()
const owned = await getUserModules(userId)

if (!owned.includes('vendas')) {
  return Astro.redirect('/curso')
}
---
```

### Purchase flow

1. User clicks "Comprar" on a locked `ModuleCard`
2. Frontend POSTs to `/api/stripe/checkout` with `{ module: 'vendas' }`
3. API route:
   - Validates `module` is a valid slug (`trafego | vendas | financeiro`)
   - Gets `userId` from `Astro.locals.auth()`, returns 401 if not authenticated
   - Checks if user already owns the module (returns redirect to `/curso` if so)
   - Looks up the Stripe price ID from `import.meta.env[MODULES[module].priceEnvKey]`
   - Creates a Stripe Checkout Session with `clerk_user_id` and `module_slug` in metadata
   - Returns `{ url: string }` (the Stripe Checkout URL)
4. Frontend redirects to `response.url`
5. User completes payment on Stripe's hosted checkout
6. Stripe sends `checkout.session.completed` webhook to `/api/stripe/webhook`
7. Webhook handler:
   - Verifies Stripe signature using `STRIPE_WEBHOOK_SECRET` and the raw request body
   - Extracts `clerk_user_id` and `module_slug` from session metadata
   - Validates both fields are present, returns 400 if missing
   - Inserts row into `purchases` table (uses `ON CONFLICT DO NOTHING` to handle duplicate webhook deliveries gracefully)
   - Returns 200
8. Stripe redirects user back to `/curso` — module now shows as unlocked

### Dashboard load (`/curso`)

1. Auth check (Clerk middleware)
2. Page frontmatter gets `userId` from `Astro.locals.auth()`
3. Query all purchases: `SELECT module_slug FROM purchases WHERE clerk_user_id = $1`
4. Pass owned module slugs to page, each `ModuleCard` renders as locked or unlocked

No caching, no session storage — DB lookup per request.

### Webhook endpoint notes

- Must access raw request body for Stripe signature verification (`request.text()` before JSON parsing)
- Uses `ON CONFLICT (clerk_user_id, module_slug) DO NOTHING` to handle idempotent webhook retries
- Returns appropriate HTTP status codes: 200 on success, 400 on bad request/missing metadata, 401 on invalid signature

## Layout & Components

### New layout: `CursoLayout.astro`
- Wraps all `/curso/*` pages
- **Wraps the existing `Layout.astro`** to inherit `<head>` setup (Google Fonts, meta tags, favicon, grain overlay) — does not duplicate it
- Adds the `CursoTopbar` and course-specific scoped styles
- Reuses existing design tokens from `global.css` (dark theme, orange accent `#f97316`)

### New components

**`CursoTopbar.astro`** — minimal top bar for the course area (logo + Clerk `<UserButton />` + dashboard link)

**`ModuleCard.astro`** — card for the `/curso` dashboard. Props: module number, name, tagline, slug, locked state, price. Shows lock icon + price + "Comprar" when locked, "Acessar Modulo" when owned.

**`Lesson.astro`** — reusable lesson block. Props: lesson number, title, description, notes (plain HTML string — no markdown parser needed, content is hardcoded in each module page), code snippets (optional, rendered in `<pre><code>` blocks). Renders: video placeholder (gray box with play icon + "Em breve" label), text notes section, code snippet blocks.

### Auth pages
- `/sign-in/[...slug].astro` and `/sign-up/[...slug].astro` use Clerk's built-in `<SignIn />` and `<SignUp />` components
- Configured with `afterSignInUrl="/curso"` and `afterSignUpUrl="/curso"` for post-auth redirect
- These pages are server-rendered (no `prerender = true`) since Clerk components are client-side rendered and benefit from server context

## Lesson Content per Module

### Module 01 — Agente de Trafego Autonomo (5 lessons)
1. Setting up Claude Code + writing your first CLAUDE.md
2. Connecting to Meta Ads / Google Ads via MCP server
3. Building the audit agent (CPA, ROAS, keyword waste analysis)
4. Automated PDF reports with daily cron
5. Alert system (Slack/WhatsApp when metrics go off)

### Module 02 — Agente de Vendas & CRM (5 lessons)
1. Connecting to HubSpot / Pipedrive via MCP
2. Lead classification engine (hot/warm/cold scoring)
3. Automated follow-up message generation
4. Pipeline monitoring + stale deal alerts
5. Weekly forecast report with email delivery

### Module 03 — Agente Financeiro Inteligente (5 lessons)
1. Processing bank statements (CSV/OFX parsing)
2. AI-powered expense categorization
3. Generating DRE and cash flow reports
4. Anomaly detection + spending alerts
5. Interactive HTML dashboard + weekly automation

### Lesson content source
Lesson content (titles, descriptions, notes, code snippets) is hardcoded as plain HTML directly in each module page file. No CMS, no markdown files, no markdown parser. Each module page passes props to `Lesson.astro` components inline. This keeps things simple for initial scaffolding — content can be extracted later if needed.

## File Structure

```
src/
  middleware.ts                          # Clerk auth only (protects /curso/*)
  lib/
    db.ts                                # Neon client + purchase query helpers
    modules.ts                           # Module config map (slugs, price env keys)
  layouts/
    CursoLayout.astro                    # course area layout (wraps Layout.astro)
  components/
    CursoTopbar.astro                    # course top bar
    ModuleCard.astro                     # dashboard card (locked/unlocked)
    Lesson.astro                         # reusable lesson block
  pages/
    curso/
      index.astro                        # dashboard (3 module cards)
      trafego.astro                      # Module 01
      vendas.astro                       # Module 02
      financeiro.astro                   # Module 03
    sign-in/
      [...slug].astro                    # Clerk sign-in
    sign-up/
      [...slug].astro                    # Clerk sign-up
    api/
      stripe/
        checkout.ts                      # POST — creates Checkout Session, returns { url }
        webhook.ts                       # POST — handles checkout.session.completed
```

Modified files:
- `astro.config.mjs` — server mode + node adapter + clerk integration
- `package.json` — new dependencies
- `CLAUDE.md` — document new `src/lib/` directory convention and Clerk client-side JS exception

## What is NOT in scope
- Video hosting/streaming (videos don't exist yet — placeholder UI only)
- Progress tracking
- Admin panel
- Email notifications
- Bundle pricing / discounts
- Refund handling (managed in Stripe dashboard)
- Landing page pricing section update (currently shows single payment — will need updating separately when module pricing is finalized)
- Deployment target selection (must be decided before launch)
