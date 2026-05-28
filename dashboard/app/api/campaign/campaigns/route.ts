import { NextRequest, NextResponse } from "next/server";

import {
  CampaignApiError,
  createCampaignApiClient,
} from "@/lib/campaign-api-client";

export async function GET(request: NextRequest) {
  try {
    const client = createCampaignApiClient();
    const params = request.nextUrl.searchParams;

    const page = params.get("page");
    const pageSize = params.get("page_size");
    const status = params.get("status");

    const data = await client.listCampaigns({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status: status || undefined,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[campaign-route] GET /api/campaign/campaigns failed", {
      page: request.nextUrl.searchParams.get("page"),
      pageSize: request.nextUrl.searchParams.get("page_size"),
      status: request.nextUrl.searchParams.get("status"),
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
