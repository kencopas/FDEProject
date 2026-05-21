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
const campaigns = await client.listCampaigns({
  page: 1,
  pageSize: 10,
  status: "active",
});
const campaign = await client.getCampaign("campaign-id");
await client.nextDay();
const docs = await client.apiDocs();
```

## API Playground UI

The home page now includes an interactive API playground at `app/page.tsx`.

It can execute:

- `GET /health`
- `POST /next-day`
- `GET /campaigns` with page, page_size, and status filters
- `GET /campaigns/{campaign_id}`
- `GET /api-docs`

### How It Works

Browser requests go to internal Next.js route handlers under `app/api/campaign/*`.
Those handlers call the typed client in `lib/campaign-api-client.ts`, which keeps the
API base URL and optional API key on the server side.
