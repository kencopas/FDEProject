import { NextResponse } from "next/server";

import {
  CampaignApiError,
  createCampaignApiClient,
} from "@/lib/campaign-api-client";

export async function GET() {
  try {
    const client = createCampaignApiClient();
    const data = await client.health();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[campaign-route] GET /api/campaign/health failed", {
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : error,
    });
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
