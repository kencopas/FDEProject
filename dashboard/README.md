This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Run With Docker

Build and start the dashboard container:

```bash
docker compose up --build
```

Or run detached:

```bash
docker compose up --build -d
```

Stop the container:

```bash
docker compose down
```

The service is exposed at `http://localhost:3000`.

### Container Environment Variables

- `CAMPAIGN_API_BASE_URL` (default: `http://host.docker.internal:8000`)
- `CAMPAIGN_API_KEY` (optional)

Set these in your shell (or a `.env` file in `dashboard/`) before running `docker compose up`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Campaign API Client

This project includes a typed API client for the Campaign API documented in `../campaign_api_docs.md`.

### Location

- `lib/campaign-api-client.ts`

### Environment Variables

- `CAMPAIGN_API_BASE_URL` (required): Base URL of the Campaign API, for example `http://localhost:8000`
- `CAMPAIGN_API_KEY` (optional): API key sent as `x-api-key` header for campaign endpoints

### Usage Example

```ts
import { createCampaignApiClient } from "@/lib/campaign-api-client";

const client = createCampaignApiClient();

const health = await client.health();
const campaignList = await client.listCampaigns({
  page: 1,
  pageSize: 10,
  status: "active",
});
const campaign = await client.getCampaign(campaignList.campaigns[0].id);
await client.nextDay();
const docs = await client.apiDocs();
```

## Campaign Dashboard UI

The home page in `app/page.tsx` is a campaign dashboard UI.

It uses these API calls:

- `GET /campaigns` with page, page_size, and status filters
- `GET /campaigns/{campaign_id}` for campaign detail (triggered internally when a campaign card is clicked)

### UX Behavior

- Campaign cards are rendered from `GET /campaigns`.
- Clicking a campaign card opens a modal with detailed campaign information.
- There is no direct campaign ID search field in the UI.

### Resilience

- Every dashboard request uses a per-attempt timeout of 3 seconds.
- Requests are retried automatically on transient failures.
- Current retry policy in `app/page.tsx`:
  - Retries: `3` (up to `4` total attempts including the initial attempt)
  - Retries happen for timeouts, network errors, and retriable HTTP responses (`408`, `429`, and `5xx`)

### Client-Side Validation

Before `GET /campaigns` is called, input values are validated in the browser:

- `page` must be an integer >= 1
- `page_size` must be an integer between 1 and 10
- `status` must be blank or one of:
  - `active`
  - `paused`
  - `completed`

### Metrics and Counts

Top dashboard metrics are derived from the currently loaded `campaigns[]` list on the client:

- Total Budget: sum of `campaign.budget`
- Total Spend: sum of `campaign.spend`
- Impressions: sum of `campaign.impressions`
- Portfolio CTR: `(sum(clicks) / sum(impressions)) * 100`

Count display in the campaign list header:

- `shown` = number of cards rendered on the current response page
- `total` = normalized API `total` value from the list response

### How It Works

Browser requests go to internal Next.js route handlers under `app/api/campaign/*`.
Those handlers call the typed client in `lib/campaign-api-client.ts`, which keeps the
API base URL and optional API key on the server side.
