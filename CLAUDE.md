# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Marketing landing page for "Empresa Autônoma" — a pre-sale course on building AI agents with Claude Code, targeting Brazilian SME founders. All copy is in Portuguese (pt-BR).

## Commands

```bash
npm run dev       # Dev server at localhost:4321
npm run build     # Production build to ./dist/
npm run preview   # Preview production build
```

No test framework — this is a static marketing site.

## Architecture

**Stack:** Astro 6 with vanilla JS. No React/Vue/Svelte. No CSS preprocessors. Node >=22.12.0.

**Routing:** File-based pages. Landing page and ebook are pre-rendered static (`export const prerender = true`). Course area is server-rendered with Clerk auth.
- `/` → `src/pages/index.astro` (main landing page, static)
- `/ebook` → `src/pages/ebook.astro` (free guide page, static)
- `/curso` → `src/pages/curso/index.astro` (student dashboard, auth required)
- `/curso/trafego` → Module 01 (purchase gated)
- `/curso/vendas` → Module 02 (purchase gated)
- `/curso/financeiro` → Module 03 (purchase gated)
- `/sign-in`, `/sign-up` → Clerk auth pages
- `/api/stripe/checkout` → Stripe Checkout Session creation
- `/api/stripe/webhook` → Stripe webhook handler

**Layouts:** `src/layouts/Layout.astro` (main), `src/layouts/EbookLayout.astro` (ebook), `src/layouts/CursoLayout.astro` (course area — wraps Layout, adds CursoTopbar).

**Components:** Flat structure in `src/components/` — each is a vertical section of the landing page, rendered top-to-bottom in `index.astro`: Topbar → Hero → Stats → Problem → Pivot → Modules → TechProof → Author → Pricing → FAQ → FinalCTA → Footer.

**Styling:** CSS variables (design tokens) defined in `src/styles/global.css`. Each component uses scoped `<style>` blocks. Dark theme with orange accent (`#f97316`).

**Client-side JS:** Inline `<script>` tags using vanilla DOM APIs:
- `IntersectionObserver` for scroll-reveal animations and terminal autoplay
- `localStorage` for the "vagas restantes" (remaining spots) urgency counter synced via `data-vagas` attributes
- Scroll-based topbar glass morphism effect

**Terminal component** (`Terminal.astro`): Animated terminal UI with sequential text reveals. Configurable via TypeScript interfaces defining lines with text, color, delay, and cursor properties. Triggered by IntersectionObserver or `data-autoplay`.

## Key Files

- `BRIEFING.md` — 35KB strategic brief with persona analysis, copy strategy, and section-by-section implementation guide. Read this for product/marketing context.
- `astro.config.mjs` — Server mode with Node adapter, Clerk integration, inlines all stylesheets.
- `src/lib/modules.ts` — Module config map (slugs, names, prices, Stripe price env keys).
- `src/lib/db.ts` — Neon Postgres helpers (getUserModules, recordPurchase).

## Conventions

- All components are `.astro` files with scoped styles — no external CSS files per component
- Interactivity uses data attributes (`data-vagas`, `data-delay`, `data-cursor`, `data-autoplay`) rather than framework bindings
- No nested component directories — everything flat in `src/components/`
- `src/lib/` directory contains shared TypeScript modules (db helpers, config maps). Landing page components don't use it.
- Clerk's `@clerk/astro` integration injects client-side JS for auth UI components (`<UserButton />`, `<SignIn />`, `<SignUp />`). This is an accepted exception to the "no React/Vue/Svelte" constraint — Clerk manages its own runtime internally.
- Course pages (`/curso/*`) are server-rendered. Landing page and ebook stay static via `export const prerender = true`.
- Module purchase gating is page-level (in frontmatter), not middleware-level. Middleware only handles Clerk auth.
