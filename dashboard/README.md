# Campaign Dashboard Service

Next.js dashboard for monitoring simulated campaign performance and drilling into campaign details.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript

## Features

- Campaign list with server-backed data loading
- Filters and controls:
  - Status filter (`all`, `active`, `paused`, `completed`)
  - Search across campaign ID, name, and advertiser
  - Sort field and sort direction
  - Toggle to hide campaigns at or above 90% budget utilization
- Portfolio metrics (budget, spend, impressions, CTR)
- Simulation controls:
  - Advance simulation day via Campaign API
  - UI lock at day 5 (requires Campaign API restart to continue)
- Campaign detail modal with on-demand detail fetch

Main UI lives in `app/page.tsx`.

## API Architecture

The browser calls internal route handlers under `app/api/campaign/*`.
Those handlers use `lib/campaign-api-client.ts` to call the external Campaign API.

Internal routes:

- `GET /api/campaign/health`
- `POST /api/campaign/next-day`
- `GET /api/campaign/campaigns`
- `GET /api/campaign/campaigns/[campaignId]`
- `GET /api/campaign/api-docs`

Campaign API client responsibilities:

- Reads `CAMPAIGN_API_BASE_URL` and optional `CAMPAIGN_API_KEY` from server env.
- Forwards `x-api-key` on campaign endpoints.
- Normalizes non-2xx responses into `CampaignApiError` with status and payload.

## Resilience And Request Policy

Client-side requests in `app/page.tsx` use:

- Per-attempt timeout: 1 second
- Retries: 3 (up to 4 attempts total)
- Retry conditions:
  - Timeout (`AbortError`)
  - Network failures (`TypeError`)
  - HTTP `408`, `429`, and `5xx`

Campaign list loading fetches paginated responses sequentially and de-duplicates by campaign ID to avoid pagination drift issues.

## Environment Variables

- `CAMPAIGN_API_BASE_URL` (required)
- `CAMPAIGN_API_KEY` (optional)

Example:

```env
CAMPAIGN_API_BASE_URL=http://localhost:8000
CAMPAIGN_API_KEY=
```

## Local Development

From `dashboard/`:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Docker

Start with Compose:

```bash
docker compose up --build
```

Run detached:

```bash
docker compose up --build -d
```

Stop:

```bash
docker compose down
```

Compose defaults:

- Dashboard exposed at `http://localhost:3000`
- `CAMPAIGN_API_BASE_URL=http://host.docker.internal:8000`

## Useful Scripts

- `npm run dev`: start dev server
- `npm run build`: production build
- `npm run start`: run production server
- `npm run lint`: ESLint
