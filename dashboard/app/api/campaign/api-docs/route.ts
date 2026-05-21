import { NextResponse } from "next/server";

import {
  CampaignApiError,
  createCampaignApiClient,
} from "@/lib/campaign-api-client";

export async function GET() {
  try {
    const client = createCampaignApiClient();
    const data = await client.apiDocs();
    return new NextResponse(data, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
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
}
