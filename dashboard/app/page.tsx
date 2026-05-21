"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Campaign = {
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
};

type CampaignListResponse = {
  page: number;
  page_size: number;
  total: number;
  campaigns: Campaign[];
};

type DashboardState = {
  loading: boolean;
  error?: string;
  list?: CampaignListResponse;
};

type ApiErrorResponse = {
  message?: string;
};

const initialDashboardState: DashboardState = {
  loading: false,
};

const REQUEST_TIMEOUT_MS = 3000;
const REQUEST_RETRIES = 3;
const MAX_PAGE_SIZE = 10;
const VALID_STATUSES = ["active", "paused", "completed"] as const;

type ValidStatus = (typeof VALID_STATUSES)[number];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number): number {
  // 220ms, 440ms, 880ms, capped for responsiveness.
  return Math.min(1000, 220 * 2 ** attempt);
}

function parseApiErrorMessage(
  payload: unknown,
  fallbackMessage: string,
): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof (payload as ApiErrorResponse).message === "string"
  ) {
    return (payload as ApiErrorResponse).message as string;
  }

  return fallbackMessage;
}

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function requestJsonWithResilience<T>(
  endpoint: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const payload = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const message = parseApiErrorMessage(payload, fallbackErrorMessage);

        if (attempt < REQUEST_RETRIES && isRetriableStatus(response.status)) {
          await sleep(retryDelayMs(attempt));
          continue;
        }

        throw new Error(message);
      }

      return payload as T;
    } catch (error) {
      clearTimeout(timeout);

      const timedOut =
        error instanceof DOMException && error.name === "AbortError";
      const retriableNetworkError = error instanceof TypeError;

      if (timedOut) {
        lastError = new Error(
          `Request timed out after 3 seconds (${REQUEST_RETRIES + 1} attempts). Please try again.`,
        );
      } else {
        lastError =
          error instanceof Error ? error : new Error(fallbackErrorMessage);
      }

      if (attempt < REQUEST_RETRIES && (timedOut || retriableNetworkError)) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error(fallbackErrorMessage);
}

type ValidFilters = {
  page: number;
  pageSize: number;
  status?: ValidStatus;
};

function validateFilters(
  rawPage: string,
  rawPageSize: string,
  rawStatus: string,
): { values?: ValidFilters; error?: string } {
  const pageTrimmed = rawPage.trim();
  const pageSizeTrimmed = rawPageSize.trim();
  const statusTrimmed = rawStatus.trim().toLowerCase();

  if (!/^\d+$/.test(pageTrimmed)) {
    return { error: "Page must be a whole number greater than or equal to 1." };
  }

  if (!/^\d+$/.test(pageSizeTrimmed)) {
    return {
      error: `Page size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`,
    };
  }

  const parsedPage = Number(pageTrimmed);
  const parsedPageSize = Number(pageSizeTrimmed);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    return { error: "Page must be a whole number greater than or equal to 1." };
  }

  if (
    !Number.isInteger(parsedPageSize) ||
    parsedPageSize < 1 ||
    parsedPageSize > MAX_PAGE_SIZE
  ) {
    return {
      error: `Page size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`,
    };
  }

  if (statusTrimmed && !VALID_STATUSES.includes(statusTrimmed as ValidStatus)) {
    return {
      error: `Status must be one of: ${VALID_STATUSES.join(", ")} (or left blank).`,
    };
  }

  return {
    values: {
      page: parsedPage,
      pageSize: parsedPageSize,
      status: statusTrimmed ? (statusTrimmed as ValidStatus) : undefined,
    },
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

export default function Home() {
  const [page, setPage] = useState("1");
  const [pageSize, setPageSize] = useState("10");
  const [status, setStatus] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>();
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [dashboardState, setDashboardState] = useState<DashboardState>(
    initialDashboardState,
  );

  const campaigns = dashboardState.list?.campaigns ?? [];
  const shownCampaignCount = campaigns.length;
  const totalCampaignCount =
    dashboardState.list &&
    Number.isFinite(dashboardState.list.total) &&
    dashboardState.list.total >= 0
      ? Math.trunc(dashboardState.list.total)
      : shownCampaignCount;
  const totalPages = dashboardState.list
    ? Math.max(
        1,
        Math.ceil(
          totalCampaignCount / Math.max(1, dashboardState.list.page_size),
        ),
      )
    : "-";

  const totals = useMemo(() => {
    return campaigns.reduce(
      (accumulator, campaign) => {
        accumulator.budget += campaign.budget;
        accumulator.spend += campaign.spend;
        accumulator.impressions += campaign.impressions;
        accumulator.clicks += campaign.clicks;
        return accumulator;
      },
      {
        budget: 0,
        spend: 0,
        impressions: 0,
        clicks: 0,
      },
    );
  }, [campaigns]);

  const ctr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  async function loadCampaigns(): Promise<void> {
    const validation = validateFilters(page, pageSize, status);
    if (!validation.values) {
      setDashboardState((previous) => ({
        ...previous,
        loading: false,
        error: validation.error,
      }));
      return;
    }

    setDashboardState((previous) => ({
      ...previous,
      loading: true,
      error: undefined,
    }));

    const query = new URLSearchParams();
    query.set("page", String(validation.values.page));
    query.set("page_size", String(validation.values.pageSize));
    if (validation.values.status) {
      query.set("status", validation.values.status);
    }

    const endpoint = query.toString()
      ? `/api/campaign/campaigns?${query.toString()}`
      : "/api/campaign/campaigns";

    try {
      const list = await requestJsonWithResilience<CampaignListResponse>(
        endpoint,
        { method: "GET" },
        "Failed to load campaigns.",
      );

      setDashboardState({
        loading: false,
        list,
      });

      if (list.campaigns.length === 0) {
        setSelectedCampaignId(undefined);
        setSelectedCampaign(undefined);
        setIsModalOpen(false);
      } else {
        setSelectedCampaignId((current) => {
          if (!current) {
            return undefined;
          }

          return list.campaigns.some((campaign) => campaign.id === current)
            ? current
            : undefined;
        });
      }
    } catch (error) {
      setDashboardState({
        loading: false,
        error: error instanceof Error ? error.message : "Request failed",
      });
    }
  }

  async function loadCampaignDetail(campaignId: string): Promise<void> {
    setDetailLoading(true);
    setDetailError(undefined);

    try {
      const payload = await requestJsonWithResilience<Campaign>(
        `/api/campaign/campaigns/${encodeURIComponent(campaignId)}`,
        { method: "GET" },
        "Failed to load campaign detail.",
      );

      setSelectedCampaign(payload);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Request failed");
      setSelectedCampaign(undefined);
    } finally {
      setDetailLoading(false);
    }
  }

  function onRefreshList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCampaigns();
  }

  function openCampaignModal(campaign: Campaign) {
    setSelectedCampaignId(campaign.id);
    setSelectedCampaign(campaign);
    setDetailError(undefined);
    setIsModalOpen(true);
    void loadCampaignDetail(campaign.id);
  }

  function closeCampaignModal() {
    setIsModalOpen(false);
  }

  useEffect(() => {
    void loadCampaigns();
    // Initial load runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsModalOpen(false);
      }
    }

    if (isModalOpen) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isModalOpen]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_5%,#f4f1de_0,#f6efe3_36%,#dce3df_100%)] text-stone-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
        <header className="rounded-3xl border border-teal-800/20 bg-white/85 p-6 shadow-[0_20px_50px_-35px_rgba(20,83,45,0.45)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-teal-800">
            Campaign Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Live Campaign Performance Board
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-700 sm:text-base">
            Monitor delivery and spend at a glance, then drill into a campaign
            to inspect dates, CPM, and engagement metrics.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-teal-900/15 bg-white/85 p-4 shadow-[0_14px_34px_-24px_rgba(20,83,45,0.6)]">
            <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
              Total Budget
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatCurrency(totals.budget)}
            </p>
          </article>
          <article className="rounded-2xl border border-teal-900/15 bg-white/85 p-4 shadow-[0_14px_34px_-24px_rgba(20,83,45,0.6)]">
            <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
              Total Spend
            </p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">
              {formatCurrency(totals.spend)}
            </p>
          </article>
          <article className="rounded-2xl border border-teal-900/15 bg-white/85 p-4 shadow-[0_14px_34px_-24px_rgba(20,83,45,0.6)]">
            <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
              Impressions
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatInteger(totals.impressions)}
            </p>
          </article>
          <article className="rounded-2xl border border-teal-900/15 bg-white/85 p-4 shadow-[0_14px_34px_-24px_rgba(20,83,45,0.6)]">
            <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
              Portfolio CTR
            </p>
            <p className="mt-2 text-2xl font-semibold">{ctr.toFixed(2)}%</p>
          </article>
        </section>

        <section className="grid gap-6">
          <article className="rounded-3xl border border-teal-900/15 bg-white/90 p-5 shadow-[0_16px_40px_-30px_rgba(21,128,61,0.65)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Campaigns</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Page {dashboardState.list?.page ?? "-"} of {totalPages}
                </p>
              </div>
              <p className="rounded-full bg-teal-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-teal-50">
                {shownCampaignCount} shown • {totalCampaignCount} total
              </p>
            </div>

            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={onRefreshList}
            >
              <label className="grid gap-1 text-sm">
                <span className="text-stone-700">Page</span>
                <input
                  className="api-input"
                  inputMode="numeric"
                  value={page}
                  onChange={(event) => setPage(event.target.value)}
                  placeholder="1"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-stone-700">Page size (max 10)</span>
                <input
                  className="api-input"
                  inputMode="numeric"
                  value={pageSize}
                  onChange={(event) => setPageSize(event.target.value)}
                  placeholder="10"
                />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="text-stone-700">Status (optional)</span>
                <input
                  className="api-input"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  placeholder="active"
                />
              </label>
              <button
                type="submit"
                className="api-btn sm:col-span-2"
                disabled={dashboardState.loading}
              >
                {dashboardState.loading ? "Refreshing..." : "Refresh Campaigns"}
              </button>
            </form>

            {dashboardState.error ? (
              <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {dashboardState.error}
              </p>
            ) : null}

            <div className="mt-4 grid gap-3">
              {campaigns.length === 0 && !dashboardState.loading ? (
                <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-600">
                  No campaigns found for this filter.
                </p>
              ) : null}

              {campaigns.map((campaign) => {
                const spentPct =
                  campaign.budget > 0
                    ? Math.min(100, (campaign.spend / campaign.budget) * 100)
                    : 0;

                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => openCampaignModal(campaign)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selectedCampaignId === campaign.id && isModalOpen
                        ? "border-teal-700 bg-teal-50 shadow-[0_12px_24px_-20px_rgba(15,118,110,0.8)]"
                        : "border-stone-200 bg-white hover:border-teal-300"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold tracking-tight">
                          {campaign.name}
                        </p>
                        <p className="text-sm text-stone-600">
                          {campaign.advertiser}
                        </p>
                      </div>
                      <span className="rounded-full bg-stone-900 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-100">
                        {campaign.status}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-stone-700">
                      <p>Budget: {formatCurrency(campaign.budget)}</p>
                      <p>Spend: {formatCurrency(campaign.spend)}</p>
                      <p>Impr: {formatInteger(campaign.impressions)}</p>
                      <p>Clicks: {formatInteger(campaign.clicks)}</p>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-teal-600 to-amber-500"
                        style={{ width: `${spentPct.toFixed(2)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </article>
        </section>

        {isModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 px-4 py-8 backdrop-blur-[2px]"
            onClick={closeCampaignModal}
            role="presentation"
          >
            <article
              className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-amber-900/20 bg-linear-to-b from-white to-amber-50 p-6 shadow-[0_24px_60px_-24px_rgba(120,53,15,0.55)]"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Campaign detail"
            >
              <button
                type="button"
                onClick={closeCampaignModal}
                className="absolute right-4 top-4 rounded-full border border-stone-300 bg-white px-3 py-1 text-sm font-medium text-stone-700 hover:border-stone-400"
              >
                Close
              </button>

              {detailError ? (
                <p className="mt-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 pr-14 text-sm text-red-700">
                  {detailError}
                </p>
              ) : null}

              {selectedCampaign ? (
                <div className="space-y-4 pr-10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                      Campaign Detail
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold leading-tight text-stone-900">
                      {selectedCampaign.name}
                    </h3>
                    <p className="mt-1 text-stone-600">
                      {selectedCampaign.advertiser}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                        Status
                      </p>
                      <p className="mt-1 text-base font-semibold">
                        {selectedCampaign.status}
                      </p>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                        CPM
                      </p>
                      <p className="mt-1 text-base font-semibold">
                        {formatCurrency(selectedCampaign.cpm)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                        Budget
                      </p>
                      <p className="mt-1 text-base font-semibold">
                        {formatCurrency(selectedCampaign.budget)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                        Spend
                      </p>
                      <p className="mt-1 text-base font-semibold text-amber-700">
                        {formatCurrency(selectedCampaign.spend)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                        Impressions
                      </p>
                      <p className="mt-1 text-base font-semibold">
                        {formatInteger(selectedCampaign.impressions)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                        Clicks
                      </p>
                      <p className="mt-1 text-base font-semibold">
                        {formatInteger(selectedCampaign.clicks)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                        Start Date
                      </p>
                      <p className="mt-1 text-base font-semibold">
                        {formatDate(selectedCampaign.start_date)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                        End Date
                      </p>
                      <p className="mt-1 text-base font-semibold">
                        {formatDate(selectedCampaign.end_date)}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-stone-500 break-all">
                    ID: {selectedCampaign.id}
                  </p>

                  {detailLoading ? (
                    <p className="text-sm text-stone-500">
                      Refreshing campaign details...
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-600">
                  Loading campaign detail...
                </p>
              )}
            </article>
          </div>
        ) : null}
      </main>
    </div>
  );
}
