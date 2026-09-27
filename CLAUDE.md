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

This is a **Next.js 14** site (Pages Router) for the MultiGlobalGroup business website.

**Production hosting is Vercel** (not Cloudflare Pages). On Vercel (`VERCEL=1`) the app is a normal Next build with `/api/*` rewrites to the Windows FastAPI (`API_URL`). Cloudflare Pages (`wrangler.toml`, `out/`, `functions/`) may still exist as an alternate/legacy path — do not treat it as the live site.

### Key architectural decisions

- **Vercel (prod)** — no static `output: 'export'`; same-origin `/api` → rewrite to Windows API. Browser never uses raw `http://` API URLs (`lib/api/config.ts`).
- **Static export** — only for non-Vercel production builds (e.g. Cloudflare `out/`). Prefer `getStaticProps` for data; no custom Next API routes for cabinet.
- **Images are unoptimized** — `next/image` optimization is disabled for export compatibility. Use `<img>` or `next/image` with standard props.
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

### Deployment (Vercel — production)

- Live site: **Vercel** (`vercel.json`, framework Next.js).
- Env: `API_URL` (server-only) pointing at Windows API, e.g. `http://91.149.133.54`. Do **not** set `NEXT_PUBLIC_API_URL` to `http://` on HTTPS.
- Browser → same-origin `/api/v1/*` → Next rewrite → Windows API.

### Alternate: Cloudflare Pages (legacy / optional)

Config: `wrangler.toml` (`pages_build_output_dir` = `out`). Pages Functions under `functions/` proxy `/api`.

```bash
npm run cf:login          # one-time OAuth
npm run deploy            # build + wrangler pages deploy
npm run pages:deploy      # deploy existing /out
```

GitHub Actions `.github/workflows/deploy.yml` still targets Cloudflare Pages — that is **not** the primary production path if the domain points at Vercel.

Quiz/leads Worker URL: `NEXT_PUBLIC_CF_WORKER_URL` → `lib/cloudflare.ts` (`CF_WORKER_URL`).
