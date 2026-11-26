# Client Manager Assignment Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans.

**Goal:** Let any manager claim an unassigned client or reassign any client.
**Architecture:** An authenticated PUT endpoint changes the client and its deal
owners in one SQLite transaction. The existing clients panel exposes the action.
**Tech Stack:** FastAPI, SQLite, Next.js, React, TypeScript.
**Spec:** `docs/superpowers/specs/2026-11-26-client-manager-design.md`

## Global Constraints

- Preserve shared read access and existing staff role permissions.
- Use existing cabinet UI components and Russian text; add no dependencies.
- Assignment updates must move all client deals and reject stale requests.

## Review Focus

- Self-registered phone accounts can be claimed and receive new deals.
- Another manager's client and all deals can be transferred; old write access ends.
- Clients, logists, staff targets and non-manager assignees are rejected.
- A stale claim cannot overwrite the manager who claimed first.
- Failed saves stay visible and preserve the current assignment.

### Task 1: Assignment API and ownership tests

Files: `api/tests/test_manager_scope.py`, `api/app/models/cabinet.py`,
`api/app/services/cabinet_store.py`, `api/app/routers/cabinet.py`.

- [x] Add API tests for claim, transfer, permissions, invalid targets and conflict.
- [x] Run new tests and confirm the endpoint is missing.
- [x] Implement `ClientManagerUpdate`, transactional `assign_client_manager` and
  `PUT /api/v1/admin/clients/{user_id}/manager` returning `UserOut`.
- [x] Update two stale shared-read expectations; run the manager scope tests.

### Task 2: Client card actions and final verification

Files: `lib/api/cabinet.ts`, `components/cabinet/manager-clients-panel.tsx`.

- [x] Add `assignClientManager(userId, managerId, expectedManagerId)` API helper.
- [x] Add claim and manager picker actions with explicit save, loading and errors.
- [x] Reload users and deals after saving; keep list grouping consistent.
- [x] Run TypeScript, build, all backend tests, and review the final diff.

## Review fixes and verification

- Added an ownership recheck inside the deal insertion transaction to prevent a
  concurrent transfer from leaving a new deal assigned to the old manager.
- Reconciled successful assignment responses locally before refreshing; a failed
  conflict refresh blocks assignment until the explicit reload succeeds.
- Manager scope tests: 24 passed, including deterministic concurrent creation and
  rollback checks. Full backend suite: 214 passed.
- TypeScript passed. Headless Chrome verified claim, transfer, filtering, save
  errors, refresh errors, conflict recovery and 390px mobile layout.
- Production build passed (1,808 static pages); only existing Browserslist and
  ambiguous Tailwind duration warnings remain.
- Unrelated parallel SMS edits in the router and their test file were preserved.
