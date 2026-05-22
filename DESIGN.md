# DESIGN

## High-Level System Design

This project is split into three services:

- `campaign-api` (external container image): source of simulated campaign data and state progression.
- `dashboard` (Next.js): browser UI for campaign monitoring and simulation control.
- `github-integration` (Python async worker): scheduled poller that opens GitHub issues for high-spend campaigns.

### Data Flow

1. Dashboard requests go to internal Next.js route handlers under `app/api/campaign/*`.
2. Route handlers call a typed Campaign API client (`lib/campaign-api-client.ts`) using server-side environment variables.
3. Browser UI renders campaign lists/details and can call `POST /api/campaign/next-day` to advance the simulation.
4. In parallel, the Python worker polls Campaign API every 10 seconds.
5. Worker computes budget utilization and creates GitHub issues when utilization is >= 90%.

## Failure Modes Considered And Handling

### Campaign API instability or slowness

- Dashboard:
  - Per-attempt timeout and bounded retries for timeouts/network errors/retriable status codes.
  - User-facing error messages on failure.
- GitHub integration:
  - Campaign API client retries with backoff.
  - Exceptions are caught per poll cycle; worker continues the next cycle.

### Pagination inconsistency / shifting windows

- Both dashboard and integration collect pages sequentially and de-duplicate campaigns by ID.
- This reduces duplicate/missing entries when API pages shift between requests.

### Duplicate issue creation

- Worker fetches open issue titles and skips creation if the expected alert title already exists.
- New titles are immediately added to an in-memory set during a poll cycle to avoid duplicate creates in the same run.

### GitHub API failures / auth issues

- Worker surfaces GitHub HTTP errors with status/body context.
- Main loop catches GitHub errors and keeps running.
- Required token is validated on startup via settings.

### Invalid configuration

- Environment variables are validated using `pydantic-settings`.
- On invalid config, startup logs validation errors clearly.

## Improvements With More Time

- Add persistent state for dedupe beyond title matching (for example, map campaign ID to issue number).
- Add automatic issue closure when campaigns move back below threshold.
- Make threshold and poll interval runtime-configurable via environment variables.
- Add integration and end-to-end tests for containerized workflows.
- Add metrics/health endpoints for the Python worker (for example, poll success rate and issue create counts).
- Add rate-limit aware behavior for GitHub API (adaptive backoff and jitter).

## Assumptions

- Campaign API is reachable from both dashboard and worker containers at `http://campaign-api:8080` in root compose.
- Campaign IDs are stable enough to use for deduplication across pages.
- GitHub token has permission to list/create/update issues in the target repository.
- Issue title-based deduplication is acceptable for this project scope.
- The simulation model is reset by restarting the Campaign API container.
