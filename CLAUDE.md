# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build static export (outputs to /out)
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test suite is configured.

## Architecture

This is a **Next.js 14 static site** (Pages Router, `output: 'export'`) for the MultiGlobalGroup business website. The build outputs to `/out` and is deployed to Cloudflare Pages via GitHub Actions on push to `main`.

### Key architectural decisions

- **Static export only** — no SSR, no API routes, no `getServerSideProps`. Use `getStaticProps` for data.
- **Images are unoptimized** — `next/image` optimization is disabled for static export compatibility. Use `<img>` or `next/image` with standard props.
- **Single-language (Russian)** — all UI text lives in `/translations/ru.ts` and `/lib/dictionary/ru.ts`. Pages receive the dictionary via `getStaticProps`.

### Directory structure

- `pages/` — Next.js pages. `_app.tsx` wraps all pages with `<Header>` and `<Footer>`.
- `components/` — Page section components (`Hero`, `Benefits`, `Catalog`, `CarFinder`, `Parts`, `Quiz`) plus `SEO.tsx` for meta tags.
- `components/ui/` — shadcn/ui components (Radix UI + Tailwind). Do not edit these manually; use the shadcn CLI to add/update.
- `lib/dictionary/` — i18n types and dictionary getter (`index.ts`) with Russian strings (`ru.ts`).
- `translations/ru.ts` — Additional Russian content strings used by page components.
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge).
- `styles/globals.css` — Tailwind base + CSS variables for theming (HSL).

### Styling conventions

- Tailwind CSS utility classes throughout; theme colors use CSS variables (`bg-primary`, `text-foreground`, etc.).
- Dark mode is configured but the site currently uses light mode. Toggle via the `dark` class on `<html>`.
- Use `cn()` from `lib/utils.ts` for conditional/merged class names.
- Primary brand color: green (`#22c55e` / `hsl(var(--primary))`).

### Deployment (Cloudflare Pages)

Config: `wrangler.toml` (`name` = Pages project, `pages_build_output_dir` = `out`).

```bash
npm run cf:login          # one-time OAuth
npm run deploy            # build + wrangler pages deploy
npm run pages:deploy      # deploy existing /out
```

CI: pushes to `main` → `.github/workflows/deploy.yml` (`npm ci && npm run build` → wrangler pages deploy).

GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.  
Optional vars: `CLOUDFLARE_PROJECT_NAME` (default `multiglobalgroup-website`), `NEXT_PUBLIC_CF_WORKER_URL`.

Quiz/leads Worker URL: `NEXT_PUBLIC_CF_WORKER_URL` → `lib/cloudflare.ts` (`CF_WORKER_URL`).
