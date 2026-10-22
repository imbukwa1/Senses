# SENSES automated testing

## Live deployment smoke tests

From `frontend/`, run `npm ci`, `npx playwright install chromium`, then
`npm run e2e:live`. The default target is https://senses-gules.vercel.app.
Set `E2E_BASE_URL` to test another deployment.

This separate config never invokes the existing database provision/cleanup scripts.
It checks login rendering, empty-form validation, mobile overflow and protected-route
redirects. Public checks do **not** establish backend readiness.

For authenticated read-only route checks, set `E2E_LIVE_AUTH=1`,
`E2E_LIVE_EMAIL` and `E2E_LIVE_PASSWORD` in the runner environment using a dedicated
existing account. Missing credentials cause configuration failure when auth is enabled.
Do not commit credentials, auth state, or `.env` files. Playwright does not automatically
load `.env`; configure environment variables in your terminal or CI.

Reports: `frontend/e2e-artifacts/live-report/index.html` and `live-results.json`.
Captures are disabled for live runs because traces/screenshots can contain tokens or
private data. Reports may still contain assertion excerpts; restrict artifact access.

## GitHub Actions

`live-smoke.yml` supports manual runs and successful Production deployment-status
events. Vercel must emit GitHub deployment-status events with environment `Production`;
otherwise use the manual action. Add repository secrets `E2E_LIVE_EMAIL` and
`E2E_LIVE_PASSWORD`, and variable `E2E_LIVE_AUTH=1` to enable authenticated checks.
Without that variable, only public checks run. No workflow has been pushed or enabled
by preparing these files.

## Existing full integration suite

`npm run e2e` continues to use `playwright.config.ts`, a dedicated test database and
fixture provisioning/cleanup. Never point its database at production. Keep mutation,
finance, collaboration and multi-user permission tests in an isolated environment.

## Coverage boundaries

FR-01–FR-65 remain the original Sprint 1 baseline. Expanded platform features include
authentication, role-based access, finance, milestones, work plans, calendar, documents,
spreadsheets, revisions/restore and collaboration. The live suite is a smoke gate only;
it does not certify any complete FR range. Full acceptance needs API/UI/test mapping,
role-specific fixtures, project/task/checklist/file workflows, search context and audit
assertions, finance checks, revision recovery and two-client collaboration tests.
