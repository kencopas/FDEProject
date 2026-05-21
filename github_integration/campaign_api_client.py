from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request


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


class CampaignApiClient:
    """Small client for the Campaign API endpoints documented in campaign_api_docs.md."""

    def __init__(
        self,
        base_url: str,
        *,
        api_key: str | None = None,
        timeout: float = 10.0,
        user_agent: str = "github-integration/0.1",
    ) -> None:
        if not base_url:
            raise ValueError("base_url is required")

        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.user_agent = user_agent

    def health(self) -> dict[str, Any]:
        """GET /health"""
        return self._request("GET", "/health")

    def next_day(self) -> dict[str, Any]:
        """POST /next-day"""
        return self._request("POST", "/next-day")

    def list_campaigns(
        self,
        *,
        page: int = 1,
        page_size: int = 10,
        status: str | None = None,
        api_key: str | None = None,
    ) -> dict[str, Any]:
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

        return self._request("GET", "/campaigns", query=query, api_key=api_key)

    def get_campaign(
        self, campaign_id: str, *, api_key: str | None = None
    ) -> dict[str, Any]:
        """GET /campaigns/{campaign_id}"""
        if not campaign_id:
            raise ValueError("campaign_id is required")

        safe_campaign_id = parse.quote(campaign_id, safe="")
        return self._request("GET", f"/campaigns/{safe_campaign_id}", api_key=api_key)

    def api_docs(self) -> str:
        """GET /api-docs"""
        return self._request("GET", "/api-docs", expect_json=False)

    def _request(
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

        req = request.Request(url=url, method=method, headers=headers)

        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
                if not expect_json:
                    return raw

                if not raw.strip():
                    return {}
                return json.loads(raw)

        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise CampaignApiError(
                message=f"Campaign API request failed: {method} {path}",
                status_code=exc.code,
                response_body=body,
            ) from exc
        except error.URLError as exc:
            raise CampaignApiError(
                f"Unable to reach Campaign API at {url}: {exc.reason}"
            ) from exc

    def _build_url(self, path: str, query: dict[str, str | int] | None = None) -> str:
        normalized_path = path if path.startswith("/") else f"/{path}"
        url = f"{self.base_url}{normalized_path}"

        if not query:
            return url

        encoded = parse.urlencode(query)
        return f"{url}?{encoded}"
