import { NextResponse } from "next/server";

import {
  CampaignApiError,
  createCampaignApiClient,
} from "@/lib/campaign-api-client";

export async function POST() {
  try {
    const client = createCampaignApiClient();
    const data = await client.nextDay();

    console.info(
      "[campaign-route] POST /api/campaign/next-day triggered successfully",
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[campaign-route] POST /api/campaign/next-day failed", {
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
