# Share Quote Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans.

**Goal:** Share fixed calculator results on the site and copy readable quote text.
**Architecture:** Authenticated snapshot creation, public token lookup, static
`/quote/` shell with client loading, common calculator actions and formatters.
**Tech Stack:** FastAPI, SQLite, Next.js Pages Router, React, TypeScript.
**Spec:** `docs/superpowers/specs/2026-11-26-share-quote-design.md`.

## Global Constraints

Preserve previous manager-assignment changes and parallel workspace edits.
Use current site tokens and components; no dependencies or hosting changes.
Publish neither personally identifying data nor mutable live calculations.

## Review Focus

Unknown or malformed links, unauthenticated creation, invalid amounts and URLs,
changed inputs during creation, clipboard failures and cancelled native sharing.

### Task 1: Snapshot storage and API

- [x] Add failing integration tests in `api/tests/test_quote_shares.py`.
- [x] Implement bounded models, token store and create/read pricing endpoints.
- [x] Verify persistence, immutability, public projection and input validation.

### Task 2: Quote formatting and actions

- [x] Test breakdown and text generation against calculator result fields.
- [x] Implement common snapshots, clipboard helper and share/copy component.
- [x] Integrate kit, restoration, cabinet/public standalone customs and history.

### Task 3: Public result and verification

- [x] Add `pages/quote.tsx` with no-login lookup, errors and responsive display.
- [x] Verify sharing, copy text, fixed results, guest view and mobile behavior.
- [ ] Review diff; run TypeScript, backend suite, formatter tests and build.

## Verification and review

- Backend: 224 tests passed, including 10 share API tests.
- Node formatter suite: 8 tests passed (UK conversions, USA fees, restoration
  extras/insurance/customs, EUR public customs, archived photos, text output).
- Chrome verified text and URL copy, repeated-link reuse, changed-price
  immutability, failed-save retry, all four cabinet modes, public customs,
  unauthenticated viewing/copying, native cancellation, manual copy fallback,
  invalid links and mobile overflow.
- Read-only review caught two photo issues; supported archived paths are now
  preserved and auction CDN photos use the existing site image resolver.
- Scoped `21st review` reported zero findings for the new actions and page.
