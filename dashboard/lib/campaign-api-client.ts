export type HttpMethod = "GET" | "POST";

export interface ValidationError {
  loc: Array<string | number>;
  msg: string;
  type: string;
}

export interface HttpValidationError {
  detail: ValidationError[];
}

export interface CampaignListParams {
  page?: number;
  pageSize?: number;
  status?: string;
}

export interface Campaign {
  id: string;
  name: string;
  advertiser: string;
  status: string;
  budget: number;
  spend: number;
  start_date: string;
  end_date: string;
  impressions: number;
  clicks: number;
  cpm: number;
}

export interface CampaignListResponse {
  page: number;
  page_size: number;
  total: number;
  campaigns: Campaign[];
}

export interface CampaignApiClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface ApiErrorPayload {
  message: string;
  details?: unknown;
}

export class CampaignApiError extends Error {
  public readonly status: number;
  public readonly payload?: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = "CampaignApiError";
    this.status = status;
    this.payload = payload;
  }
}

export class CampaignApiClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CampaignApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async health(): Promise<unknown> {
    return this.request<unknown>("/health", "GET");
  }

  async nextDay(): Promise<unknown> {
    return this.request<unknown>("/next-day", "POST");
  }

  async listCampaigns(
    params: CampaignListParams = {},
  ): Promise<CampaignListResponse> {
    const query = new URLSearchParams();

    if (params.page !== undefined) {
      query.set("page", String(params.page));
    }
    if (params.pageSize !== undefined) {
      query.set("page_size", String(params.pageSize));
    }
    if (params.status) {
      query.set("status", params.status);
    }

    const search = query.toString();
    const path = search ? `/campaigns?${search}` : "/campaigns";

    const response = await this.request<CampaignListResponse>(path, "GET", {
      includeApiKey: true,
    });

    return response;
  }

  async getCampaign(campaignId: string): Promise<Campaign> {
    return this.request<Campaign>(
      `/campaigns/${encodeURIComponent(campaignId)}`,
      "GET",
      {
        includeApiKey: true,
      },
    );
  }

  async apiDocs(): Promise<string> {
    return this.requestText("/api-docs", "GET");
  }

  private async request<T>(
    path: string,
    method: HttpMethod,
    options: { includeApiKey?: boolean } = {},
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: this.buildHeaders(options.includeApiKey),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[campaign-api-client] Request failed", {
        method,
        path,
        status: response.status,
      });
      throw await this.toApiError(response);
    }

    return (await response.json()) as T;
  }

  private async requestText(path: string, method: HttpMethod): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[campaign-api-client] Request failed", {
        method,
        path,
        status: response.status,
      });
      throw await this.toApiError(response);
    }

    return response.text();
  }

  private buildHeaders(includeApiKey = false): HeadersInit | undefined {
    if (!includeApiKey) {
      return undefined;
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    return headers;
  }

  private async toApiError(response: Response): Promise<CampaignApiError> {
    const contentType = response.headers.get("content-type") ?? "";

    try {
      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as
          | HttpValidationError
          | ApiErrorPayload;

        if (
          typeof payload === "object" &&
          payload !== null &&
          "detail" in payload &&
          Array.isArray((payload as HttpValidationError).detail)
        ) {
          return new CampaignApiError(
            response.status,
            "Validation error",
            payload,
          );
        }

        if (
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof (payload as ApiErrorPayload).message === "string"
        ) {
          return new CampaignApiError(
            response.status,
            (payload as ApiErrorPayload).message,
            payload,
          );
        }

        return new CampaignApiError(
          response.status,
          `Request failed with status ${response.status}`,
          payload,
        );
      }

      const text = await response.text();
      return new CampaignApiError(
        response.status,
        text || `Request failed with status ${response.status}`,
      );
    } catch {
      return new CampaignApiError(
        response.status,
        `Request failed with status ${response.status}`,
      );
    }
  }
}

export function createCampaignApiClient(): CampaignApiClient {
  const baseUrl = process.env.CAMPAIGN_API_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      "CAMPAIGN_API_BASE_URL is required to create CampaignApiClient",
    );
  }

  return new CampaignApiClient({
    baseUrl,
    apiKey: process.env.CAMPAIGN_API_KEY,
  });
}
