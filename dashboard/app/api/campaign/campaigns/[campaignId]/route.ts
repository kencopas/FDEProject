import { NextResponse } from "next/server";

import {
  CampaignApiError,
  createCampaignApiClient,
} from "@/lib/campaign-api-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  let campaignId = "unknown";

  try {
    const client = createCampaignApiClient();
    ({ campaignId } = await params);
    const data = await client.getCampaign(campaignId);
    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[campaign-route] GET /api/campaign/campaigns/[campaignId] failed",
      {
        campaignId,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : error,
      },
    );
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown) {
  if (error instanceof CampaignApiError) {
    return NextResponse.json(
      {
        message: error.message,
        payload: error.payload,
      },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ message }, { status: 500 });
}
