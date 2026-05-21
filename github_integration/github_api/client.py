from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib import parse

import httpx

DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com"
DEFAULT_GITHUB_API_VERSION = "2026-03-10"


@dataclass(slots=True)
class GitHubApiError(Exception):
    """Raised when a GitHub REST API request fails."""

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


class GitHubIssuesApiClient:
    """Small GitHub client for repository issue operations."""

    def __init__(
        self,
        *,
        token: str,
        base_url: str = DEFAULT_GITHUB_API_BASE_URL,
        api_version: str = DEFAULT_GITHUB_API_VERSION,
        timeout: float = 10.0,
        user_agent: str = "github-integration/0.1",
    ) -> None:
        if not token or not token.strip():
            raise ValueError("token is required")
        if not base_url or not base_url.strip():
            raise ValueError("base_url is required")
        if timeout <= 0:
            raise ValueError("timeout must be > 0")

        self.token = token.strip()
        self.base_url = base_url.rstrip("/")
        self.api_version = api_version
        self.timeout = timeout
        self.user_agent = user_agent
        self._http_client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.token}",
                "X-GitHub-Api-Version": self.api_version,
                "User-Agent": self.user_agent,
            },
        )

    async def __aenter__(self) -> GitHubIssuesApiClient:
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http_client.aclose()

    async def list_issues(
        self,
        owner: str,
        repo: str,
        *,
        milestone: str | int | None = None,
        state: str | None = None,
        assignee: str | None = None,
        creator: str | None = None,
        mentioned: str | None = None,
        labels: list[str] | None = None,
        sort: str | None = None,
        direction: str | None = None,
        since: str | None = None,
        per_page: int | None = None,
        page: int | None = None,
    ) -> list[dict[str, Any]]:
        """GET /repos/{owner}/{repo}/issues"""
        self._validate_repo_identifiers(owner, repo)

        query: dict[str, str | int] = {}
        if milestone is not None:
            query["milestone"] = milestone
        if state is not None:
            query["state"] = state
        if assignee is not None:
            query["assignee"] = assignee
        if creator is not None:
            query["creator"] = creator
        if mentioned is not None:
            query["mentioned"] = mentioned
        if labels:
            query["labels"] = ",".join(labels)
        if sort is not None:
            query["sort"] = sort
        if direction is not None:
            query["direction"] = direction
        if since is not None:
            query["since"] = since
        if per_page is not None:
            query["per_page"] = per_page
        if page is not None:
            query["page"] = page

        response = await self._request(
            "GET",
            f"/repos/{self._q(owner)}/{self._q(repo)}/issues",
            query=query or None,
        )
        if not isinstance(response, list):
            raise GitHubApiError("Unexpected list_issues response shape")
        return response

    async def get_issue(
        self, owner: str, repo: str, issue_number: int
    ) -> dict[str, Any]:
        """GET /repos/{owner}/{repo}/issues/{issue_number}"""
        self._validate_repo_identifiers(owner, repo)
        self._validate_issue_number(issue_number)

        response = await self._request(
            "GET",
            f"/repos/{self._q(owner)}/{self._q(repo)}/issues/{issue_number}",
        )
        if not isinstance(response, dict):
            raise GitHubApiError("Unexpected get_issue response shape")
        return response

    async def create_issue(
        self,
        owner: str,
        repo: str,
        *,
        title: str,
        body: str | None = None,
        milestone: int | str | None = None,
        labels: list[str] | None = None,
        assignees: list[str] | None = None,
        issue_type: str | None = None,
    ) -> dict[str, Any]:
        """POST /repos/{owner}/{repo}/issues"""
        self._validate_repo_identifiers(owner, repo)
        if not title or not title.strip():
            raise ValueError("title is required")

        payload: dict[str, Any] = {"title": title}
        if body is not None:
            payload["body"] = body
        if milestone is not None:
            payload["milestone"] = milestone
        if labels is not None:
            payload["labels"] = labels
        if assignees is not None:
            payload["assignees"] = assignees
        if issue_type is not None:
            payload["type"] = issue_type

        response = await self._request(
            "POST",
            f"/repos/{self._q(owner)}/{self._q(repo)}/issues",
            json_body=payload,
        )
        if not isinstance(response, dict):
            raise GitHubApiError("Unexpected create_issue response shape")
        return response

    async def update_issue(
        self,
        owner: str,
        repo: str,
        issue_number: int,
        *,
        title: str | None = None,
        body: str | None = None,
        state: str | None = None,
        state_reason: str | None = None,
        milestone: int | str | None = None,
        labels: list[str] | None = None,
        assignees: list[str] | None = None,
        issue_type: str | None = None,
    ) -> dict[str, Any]:
        """PATCH /repos/{owner}/{repo}/issues/{issue_number}"""
        self._validate_repo_identifiers(owner, repo)
        self._validate_issue_number(issue_number)

        payload: dict[str, Any] = {}
        if title is not None:
            payload["title"] = title
        if body is not None:
            payload["body"] = body
        if state is not None:
            payload["state"] = state
        if state_reason is not None:
            payload["state_reason"] = state_reason
        if milestone is not None:
            payload["milestone"] = milestone
        if labels is not None:
            payload["labels"] = labels
        if assignees is not None:
            payload["assignees"] = assignees
        if issue_type is not None:
            payload["type"] = issue_type

        if not payload:
            raise ValueError("At least one field must be provided to update_issue")

        response = await self._request(
            "PATCH",
            f"/repos/{self._q(owner)}/{self._q(repo)}/issues/{issue_number}",
            json_body=payload,
        )
        if not isinstance(response, dict):
            raise GitHubApiError("Unexpected update_issue response shape")
        return response

    async def _request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, str | int] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        url = self._build_url(path, query)

        try:
            response = await self._http_client.request(
                method,
                path,
                params=query,
                json=json_body,
            )
            response.raise_for_status()

            raw = response.text
            if not raw.strip():
                return {}
            return json.loads(raw)

        except httpx.HTTPStatusError as exc:
            body_text = exc.response.text
            raise GitHubApiError(
                message=f"GitHub API request failed: {method} {path}",
                status_code=exc.response.status_code,
                response_body=body_text,
            ) from exc
        except httpx.RequestError as exc:
            raise GitHubApiError(
                message=f"Unable to reach GitHub API at {url}: {exc}"
            ) from exc
        except json.JSONDecodeError as exc:
            raise GitHubApiError(
                message=f"GitHub API returned invalid JSON for {method} {path}"
            ) from exc

    def _build_url(self, path: str, query: dict[str, str | int] | None = None) -> str:
        normalized_path = path if path.startswith("/") else f"/{path}"
        url = f"{self.base_url}{normalized_path}"

        if not query:
            return url

        encoded = parse.urlencode(query)
        return f"{url}?{encoded}"

    @staticmethod
    def _q(value: str) -> str:
        return parse.quote(value, safe="")

    @staticmethod
    def _validate_issue_number(issue_number: int) -> None:
        if issue_number < 1:
            raise ValueError("issue_number must be >= 1")

    @staticmethod
    def _validate_repo_identifiers(owner: str, repo: str) -> None:
        if not owner or not owner.strip():
            raise ValueError("owner is required")
        if not repo or not repo.strip():
            raise ValueError("repo is required")
