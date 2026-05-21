"use client";

import { useEffect, useMemo, useState } from "react";

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

const REQUEST_TIMEOUT_MS = 1000;
const REQUEST_RETRIES = 3;
const MAX_SIMULATION_DAY = 5;
const CAMPAIGNS_PER_PAGE = 10;
const VALID_STATUSES = ["active", "paused", "completed"] as const;
const STATUS_FILTER_OPTIONS = ["all", ...VALID_STATUSES] as const;
const SORT_FIELDS = [
  "name",
  "advertiser",
  "status",
  "budget",
  "spend",
  "impressions",
  "clicks",
  "cpm",
  "start_date",
  "end_date",
] as const;

type ValidStatus = (typeof VALID_STATUSES)[number];
type StatusFilterOption = (typeof STATUS_FILTER_OPTIONS)[number];
type CampaignSortField = (typeof SORT_FIELDS)[number];
type SortDirection = "asc" | "desc";

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

function extractSimulationDay(payload: unknown): number | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const candidates = [
    "day",
    "current_day",
    "simulation_day",
    "currentDay",
    "simulationDay",
  ] as const;

  for (const key of candidates) {
    if (!(key in payload)) {
      continue;
    }

    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
  }

  return undefined;
}

function extractCampaignsOverThreshold(payload: unknown): number | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const candidates = [
    "campaigns_over_threshold",
    "over_threshold_campaigns",
    "campaignsOverThreshold",
    "overThresholdCampaigns",
  ] as const;

  for (const key of candidates) {
    if (!(key in payload)) {
      continue;
    }

    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }

    if (Array.isArray(value)) {
      return value.length;
    }
  }

  return undefined;
}

function containerReachabilityHint(): string {
  return "Network error: unable to reach the Campaign API container. Verify the container is running and reachable from this app.";
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

        if (isRetriableStatus(response.status)) {
          throw new Error(`${message} ${containerReachabilityHint()}`);
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
          `Request timed out after 1 second (${REQUEST_RETRIES + 1} attempts). ${containerReachabilityHint()}`,
        );
      } else if (retriableNetworkError) {
        lastError = new Error(containerReachabilityHint());
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

function isOverBudgetThreshold(campaign: Campaign): boolean {
  return campaign.budget > 0 && campaign.spend / campaign.budget >= 0.9;
}

export default function Home() {
  const [simulationDay, setSimulationDay] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<CampaignSortField>("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [hideOverNinetyPercentBudget, setHideOverNinetyPercentBudget] =
    useState(false);
  const [advancingDay, setAdvancingDay] = useState(false);
  const [advanceDayMessage, setAdvanceDayMessage] = useState<string>();
  const [campaignsOverThreshold, setCampaignsOverThreshold] = useState<
    number | undefined
  >();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>();
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [dashboardState, setDashboardState] = useState<DashboardState>(
    initialDashboardState,
  );

  const campaigns = useMemo(
    () => dashboardState.list?.campaigns ?? [],
    [dashboardState.list?.campaigns],
  );
  const filteredCampaigns = useMemo(() => {
    const loweredSearchQuery = searchQuery.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      if (hideOverNinetyPercentBudget && isOverBudgetThreshold(campaign)) {
        return false;
      }

      if (loweredSearchQuery) {
        const haystack =
          `${campaign.id} ${campaign.name} ${campaign.advertiser}`.toLowerCase();
        if (!haystack.includes(loweredSearchQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [campaigns, searchQuery, hideOverNinetyPercentBudget]);
  const sortedCampaigns = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const ordered = [...filteredCampaigns];

    ordered.sort((left, right) => {
      const leftValue = left[sortField];
      const rightValue = right[sortField];

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue)) * direction;
    });

    return ordered;
  }, [filteredCampaigns, sortField, sortDirection]);
  const totalCampaignCount = sortedCampaigns.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalCampaignCount / CAMPAIGNS_PER_PAGE),
  );
  const activePage = Math.min(currentPage, totalPages);
  const paginatedCampaigns = useMemo(() => {
    const start = (activePage - 1) * CAMPAIGNS_PER_PAGE;
    return sortedCampaigns.slice(start, start + CAMPAIGNS_PER_PAGE);
  }, [sortedCampaigns, activePage]);
  const shownCampaignCount = paginatedCampaigns.length;

  const totals = useMemo(() => {
    return sortedCampaigns.reduce(
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
  }, [sortedCampaigns]);

  const ctr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const simulationLocked = simulationDay >= MAX_SIMULATION_DAY;

  async function fetchAllCampaigns(
    status?: ValidStatus,
  ): Promise<CampaignListResponse> {
    let page = 1;
    const campaignsAccumulator: Campaign[] = [];
    const seenCampaignIds = new Set<string>();

    while (true) {
      const query = new URLSearchParams();
      query.set("page", String(page));
      query.set("page_size", String(CAMPAIGNS_PER_PAGE));
      if (status) {
        query.set("status", status);
      }

      const endpoint = `/api/campaign/campaigns?${query.toString()}`;
      const response = await requestJsonWithResilience<CampaignListResponse>(
        endpoint,
        { method: "GET" },
        "Failed to load campaigns.",
      );

      for (const campaign of response.campaigns) {
        if (seenCampaignIds.has(campaign.id)) {
          continue;
        }

        seenCampaignIds.add(campaign.id);
        campaignsAccumulator.push(campaign);
      }

      if (
        response.campaigns.length === 0 ||
        response.campaigns.length < CAMPAIGNS_PER_PAGE
      ) {
        break;
      }

      page += 1;
    }

    return {
      page: 1,
      page_size: CAMPAIGNS_PER_PAGE,
      total: campaignsAccumulator.length,
      campaigns: campaignsAccumulator,
    };
  }

  async function loadCampaigns(
    statusOverride?: StatusFilterOption,
  ): Promise<void> {
    const effectiveStatus = statusOverride ?? statusFilter;
    const selectedStatus =
      effectiveStatus === "all" ? undefined : (effectiveStatus as ValidStatus);

    setDashboardState((previous) => ({
      ...previous,
      loading: true,
      error: undefined,
    }));

    try {
      const list = await fetchAllCampaigns(selectedStatus);

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

  function onPrevPage() {
    if (dashboardState.loading || activePage <= 1) {
      return;
    }

    setCurrentPage(activePage - 1);
  }

  function onNextPage() {
    if (dashboardState.loading || activePage >= totalPages) {
      return;
    }

    setCurrentPage(activePage + 1);
  }

  async function onAdvanceDay() {
    if (simulationLocked) {
      setAdvanceDayMessage(undefined);
      return;
    }

    setAdvancingDay(true);
    setAdvanceDayMessage(undefined);

    try {
      const response = await requestJsonWithResilience<unknown>(
        "/api/campaign/next-day",
        { method: "POST" },
        "Failed to advance simulation to the next day.",
      );

      const apiDay = extractSimulationDay(response);
      const thresholdCount = extractCampaignsOverThreshold(response);
      const nextDay = apiDay ?? simulationDay + 1;
      const normalizedDay = Math.min(MAX_SIMULATION_DAY, Math.max(0, nextDay));
      setSimulationDay(normalizedDay);
      if (thresholdCount !== undefined) {
        setCampaignsOverThreshold(thresholdCount);
      }

      await loadCampaigns();

      if (isModalOpen && selectedCampaignId) {
        await loadCampaignDetail(selectedCampaignId);
      }

      setAdvanceDayMessage(
        normalizedDay >= MAX_SIMULATION_DAY
          ? undefined
          : `Simulation progressed to day ${normalizedDay}.`,
      );
    } catch (error) {
      setAdvanceDayMessage(
        error instanceof Error
          ? error.message
          : "Failed to advance simulation to the next day.",
      );
    } finally {
      setAdvancingDay(false);
    }
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
    const frame = window.requestAnimationFrame(() => {
      void loadCampaigns();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-teal-800">
                Campaign Dashboard
              </p>
              <p className="mt-2 inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-800">
                Simulation Day {simulationDay}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Live Campaign Performance Board
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-700 sm:text-base">
                Monitor delivery and spend at a glance, then drill into a
                campaign to inspect dates, CPM, and engagement metrics.
              </p>
            </div>

            <button
              type="button"
              className="api-btn"
              onClick={() => void onAdvanceDay()}
              disabled={advancingDay || simulationLocked}
            >
              {advancingDay
                ? "Advancing Day..."
                : simulationLocked
                  ? "Day 5 Reached"
                  : "Advance to Next Day"}
            </button>
          </div>

          {simulationLocked ? (
            <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              You cannot progress after day {MAX_SIMULATION_DAY}. Restart the
              Campaign API container to continue the simulation.
            </p>
          ) : null}

          {advanceDayMessage ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {advanceDayMessage}
            </p>
          ) : null}
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
          <article className="rounded-2xl border border-amber-900/20 bg-amber-50/80 p-4 shadow-[0_14px_34px_-24px_rgba(180,83,9,0.5)]">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-800">
              # Campaigns Over Threshold
            </p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">
              {campaignsOverThreshold ?? "-"}
            </p>
          </article>
        </section>

        <section className="grid gap-6">
          <article className="rounded-3xl border border-teal-900/15 bg-white/90 p-5 shadow-[0_16px_40px_-30px_rgba(21,128,61,0.65)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Campaigns</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Page {activePage} of {totalPages}
                </p>
              </div>
              <p className="rounded-full bg-teal-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-teal-50">
                {shownCampaignCount} shown • {totalCampaignCount} total
              </p>
            </div>

            <form className="mt-4 grid gap-3 sm:grid-cols-2">
              <section className="sm:col-span-2 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">
                  Status Filter
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STATUS_FILTER_OPTIONS.map((option) => {
                    const selected = statusFilter === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          if (option === statusFilter) {
                            return;
                          }

                          setStatusFilter(option);
                          setCurrentPage(1);
                          void loadCampaigns(option);
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                          selected
                            ? "border border-teal-700 bg-teal-700 text-teal-50"
                            : "border border-stone-300 bg-white text-stone-700 hover:border-teal-400"
                        }`}
                        aria-pressed={selected}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="sm:col-span-2 rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">
                  Search And Sort
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-stone-700">
                      Search (ID/Name/Advertiser)
                    </span>
                    <input
                      className="api-input"
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="migraine"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-stone-700">Sort Field</span>
                    <select
                      className="api-input"
                      value={sortField}
                      onChange={(event) => {
                        setSortField(event.target.value as CampaignSortField);
                        setCurrentPage(1);
                      }}
                    >
                      {SORT_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sm:col-span-2 lg:col-span-1 inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-stone-300"
                      checked={hideOverNinetyPercentBudget}
                      onChange={(event) => {
                        setHideOverNinetyPercentBudget(event.target.checked);
                        setCurrentPage(1);
                      }}
                    />
                    Hide campaigns at or above 90% budget
                  </label>
                  <div className="grid gap-1 text-sm sm:col-span-2 lg:col-span-3">
                    <span className="text-stone-700">Sort Direction</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSortDirection("asc");
                          setCurrentPage(1);
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                          sortDirection === "asc"
                            ? "border border-teal-700 bg-teal-700 text-teal-50"
                            : "border border-stone-300 bg-white text-stone-700 hover:border-teal-400"
                        }`}
                        aria-pressed={sortDirection === "asc"}
                      >
                        Ascending
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSortDirection("desc");
                          setCurrentPage(1);
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                          sortDirection === "desc"
                            ? "border border-teal-700 bg-teal-700 text-teal-50"
                            : "border border-stone-300 bg-white text-stone-700 hover:border-teal-400"
                        }`}
                        aria-pressed={sortDirection === "desc"}
                      >
                        Descending
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </form>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                className="api-btn"
                onClick={onPrevPage}
                disabled={dashboardState.loading || currentPage <= 1}
              >
                Previous Page
              </button>
              <p className="text-sm text-stone-600">
                Showing page {activePage} of {totalPages}
              </p>
              <button
                type="button"
                className="api-btn"
                onClick={onNextPage}
                disabled={dashboardState.loading || activePage >= totalPages}
              >
                Next Page
              </button>
            </div>

            {dashboardState.error ? (
              <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {dashboardState.error}
              </p>
            ) : null}

            <div className="mt-4 grid gap-3">
              {paginatedCampaigns.length === 0 && !dashboardState.loading ? (
                <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-600">
                  {hideOverNinetyPercentBudget
                    ? "No campaigns remain after hiding 90%+ budget campaigns."
                    : "No campaigns found for this filter."}
                </p>
              ) : null}

              {paginatedCampaigns.map((campaign) => {
                const spentPct =
                  campaign.budget > 0
                    ? Math.min(100, (campaign.spend / campaign.budget) * 100)
                    : 0;
                const budgetThresholdExceeded = isOverBudgetThreshold(campaign);

                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => openCampaignModal(campaign)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selectedCampaignId === campaign.id && isModalOpen
                        ? "border-teal-700 bg-teal-50 shadow-[0_12px_24px_-20px_rgba(15,118,110,0.8)]"
                        : budgetThresholdExceeded
                          ? "border-amber-400 bg-amber-50/70 hover:border-amber-500"
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

                    {budgetThresholdExceeded ? (
                      <p className="mt-3 inline-flex rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
                        Spend at 90%+ of budget
                      </p>
                    ) : null}

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
