from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import date
from typing import Any
from urllib import parse

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

DEFAULT_CAMPAIGN_REQUEST_TIMEOUT_SECONDS = 1.0
DEFAULT_CAMPAIGN_MAX_RETRIES = 3


@dataclass(slots=True)
class CampaignApiError(Exception):
    """Raised when the Campaign API returns an unsuccessful response."""

    message: str
    status_code: int | None = None
    response_body: str | None = None

    def __str__(self) -> str:
        parts = [self.message]
        if self.status_code is not None:
            parts.append(f"status={self.status_code}")
        if self.response_body:
            parts.append(f"body={self.response_body}")
        return " | ".join(parts)


class Campaign(BaseModel):
    """Validated campaign payload from Campaign API responses."""

    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    advertiser: str
    status: str
    budget: float
    spend: float
    start_date: date
    end_date: date
    impressions: int
    clicks: int
    cpm: float


class CampaignListResponse(BaseModel):
    """Validated response payload for GET /campaigns."""

    model_config = ConfigDict(extra="ignore")

    page: int
    page_size: int
    total: int
    campaigns: list[Campaign]


class CampaignApiClient:
    """Small client for the Campaign API endpoints documented in campaign_api_docs.md."""

    def __init__(
        self,
        base_url: str,
        *,
        api_key: str | None = None,
        timeout: float = DEFAULT_CAMPAIGN_REQUEST_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_CAMPAIGN_MAX_RETRIES,
        user_agent: str = "github-integration/0.1",
    ) -> None:
        if not base_url:
            raise ValueError("base_url is required")
        if timeout <= 0:
            raise ValueError("timeout must be > 0")
        if max_retries < 0:
            raise ValueError("max_retries must be >= 0")

        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        # Campaign API calls intentionally use a max 1-second request timeout.
        self.timeout = min(timeout, DEFAULT_CAMPAIGN_REQUEST_TIMEOUT_SECONDS)
        self.max_retries = max_retries
        self.user_agent = user_agent
        self._http_client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
            headers={"User-Agent": self.user_agent},
        )

    async def __aenter__(self) -> CampaignApiClient:
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http_client.aclose()

    async def health(self) -> dict[str, Any]:
        """GET /health"""
        return await self._request("GET", "/health")

    async def next_day(self) -> dict[str, Any]:
        """POST /next-day"""
        return await self._request("POST", "/next-day")

    async def list_campaigns(
        self,
        *,
        page: int = 1,
        page_size: int = 10,
        status: str | None = None,
        api_key: str | None = None,
    ) -> CampaignListResponse:
        """GET /campaigns"""
        if page < 1:
            raise ValueError("page must be >= 1")
        if page_size < 1 or page_size > 10:
            raise ValueError("page_size must be between 1 and 10")

        query: dict[str, str | int] = {
            "page": page,
            "page_size": page_size,
        }
        if status:
            query["status"] = status

        response = await self._request(
            "GET", "/campaigns", query=query, api_key=api_key
        )
        try:
            return CampaignListResponse.model_validate(response)
        except ValidationError as exc:
            raise CampaignApiError(
                message="Campaign API returned invalid response for GET /campaigns",
                response_body=str(exc),
            ) from exc

    async def get_campaign(
        self, campaign_id: str, *, api_key: str | None = None
    ) -> Campaign:
        """GET /campaigns/{campaign_id}"""
        if not campaign_id:
            raise ValueError("campaign_id is required")

        safe_campaign_id = parse.quote(campaign_id, safe="")
        response = await self._request(
            "GET", f"/campaigns/{safe_campaign_id}", api_key=api_key
        )
        try:
            return Campaign.model_validate(response)
        except ValidationError as exc:
            raise CampaignApiError(
                message=(
                    "Campaign API returned invalid response "
                    f"for GET /campaigns/{campaign_id}"
                ),
                response_body=str(exc),
            ) from exc

    async def api_docs(self) -> str:
        """GET /api-docs"""
        return await self._request("GET", "/api-docs", expect_json=False)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, str | int] | None = None,
        api_key: str | None = None,
        expect_json: bool = True,
    ) -> Any:
        url = self._build_url(path, query)

        headers = {
            "Accept": "application/json" if expect_json else "text/plain",
            "User-Agent": self.user_agent,
        }

        request_api_key = api_key if api_key is not None else self.api_key
        if request_api_key:
            headers["x-api-key"] = request_api_key

        normalized_path = path if path.startswith("/") else f"/{path}"
        attempts = self.max_retries + 1
        last_timeout_reason: str | None = None

        for attempt in range(attempts):
            try:
                response = await self._http_client.request(
                    method,
                    normalized_path,
                    params=query,
                    headers=headers,
                )
                response.raise_for_status()

                raw = response.text
                if not expect_json:
                    return raw

                if not raw.strip():
                    return {}
                return json.loads(raw)

            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                body = exc.response.text
                should_retry = status >= 500 and attempt < self.max_retries
                if should_retry:
                    await asyncio.sleep(self._retry_delay_seconds(attempt))
                    continue

                raise CampaignApiError(
                    message=(
                        f"Campaign API request failed after {attempt + 1} attempt(s): "
                        f"{method} {path}"
                    ),
                    status_code=status,
                    response_body=body,
                ) from exc
            except httpx.TimeoutException as exc:
                last_timeout_reason = str(exc)
                if attempt < self.max_retries:
                    await asyncio.sleep(self._retry_delay_seconds(attempt))
                    continue
                break
            except httpx.RequestError as exc:
                raise CampaignApiError(
                    f"Unable to reach Campaign API at {url}: {exc}"
                ) from exc
            except json.JSONDecodeError as exc:
                raise CampaignApiError(
                    message=f"Campaign API returned invalid JSON for {method} {path}"
                ) from exc

        timeout_reason = last_timeout_reason or "request timed out"
        raise CampaignApiError(
            message=(
                f"Campaign API timeout after {attempts} attempt(s): {method} {path}"
            ),
            response_body=timeout_reason,
        )

    def _build_url(self, path: str, query: dict[str, str | int] | None = None) -> str:
        normalized_path = path if path.startswith("/") else f"/{path}"
        url = f"{self.base_url}{normalized_path}"

        if not query:
            return url

        encoded = parse.urlencode(query)
        return f"{url}?{encoded}"

    @staticmethod
    def _retry_delay_seconds(attempt: int) -> float:
        # 0.2s, 0.4s, 0.8s backoff for retries.
        return 0.2 * (2**attempt)
