from __future__ import annotations
from typing import Any
import asyncio
import os
import sys
from pathlib import Path

# Allow running this script directly: uv run scripts/close_all_issues.py
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import GitHubApiSettings, get_logger, setup_logging
from github_api.client import GitHubApiError, GitHubIssuesApiClient

DEFAULT_GITHUB_OWNER = "kencopas"
DEFAULT_GITHUB_REPO = "FDEProject"
PER_PAGE = 100
BATCH_SIZE = 10

logger = get_logger(__name__)


from utils import batched


async def _list_repo_issues(
    github_client: GitHubIssuesApiClient, owner: str, repo: str
) -> list[dict[str, Any]]:
    page = 1
    issues: list[dict[str, Any]] = []

    while True:
        page_items = await github_client.list_issues(
            owner=owner,
            repo=repo,
            state="all",
            per_page=PER_PAGE,
            page=page,
        )

        if not page_items:
            break

        # list_issues includes PRs; skip those because issue update/delete logic differs.
        for item in page_items:
            if "pull_request" in item:
                continue
            issues.append(item)

        if len(page_items) < PER_PAGE:
            break

        page += 1

    return issues


async def _close_issue(
    github_client: GitHubIssuesApiClient,
    owner: str,
    repo: str,
    issue_number: int,
) -> None:
    await github_client.update_issue(
        owner=owner,
        repo=repo,
        issue_number=issue_number,
        state="closed",
        state_reason="not_planned",
    )


async def main() -> None:
    setup_logging()

    github_settings = GitHubApiSettings()
    owner = os.getenv("GITHUB_REPO_OWNER", DEFAULT_GITHUB_OWNER)
    repo = os.getenv("GITHUB_REPO_NAME", DEFAULT_GITHUB_REPO)

    github_client = GitHubIssuesApiClient(
        token=github_settings.github_token,
        base_url=str(github_settings.github_api_base_url),
        api_version=github_settings.github_api_version,
        timeout=github_settings.github_api_timeout,
        user_agent=github_settings.github_api_user_agent,
    )

    try:
        all_issues = await _list_repo_issues(github_client, owner, repo)
        issue_numbers = [
            int(issue["number"])
            for issue in all_issues
            if isinstance(issue.get("number"), int) and issue.get("state") == "open"
        ]

        logger.info(
            "Repo scan complete for %s/%s | total_issues=%s | open_issues=%s",
            owner,
            repo,
            len(all_issues),
            len(issue_numbers),
        )

        if not issue_numbers:
            logger.info("No open issues found. Nothing to close.")
            return

        closed_count = 0
        failed_count = 0

        for batch in batched(issue_numbers, BATCH_SIZE):
            results = await asyncio.gather(
                *[
                    _close_issue(
                        github_client,
                        owner,
                        repo,
                        issue_number,
                    )
                    for issue_number in batch
                ],
                return_exceptions=True,
            )

            for issue_number, result in zip(batch, results, strict=True):
                if isinstance(result, Exception):
                    failed_count += 1
                    logger.error(
                        "Failed to close issue #%s: %s",
                        issue_number,
                        result,
                    )
                else:
                    closed_count += 1
                    logger.info("Closed issue #%s", issue_number)

        logger.info(
            "Done. Attempted=%s | Closed=%s | Failed=%s",
            len(issue_numbers),
            closed_count,
            failed_count,
        )

    except GitHubApiError as exc:
        logger.error("GitHub API error: %s", exc)
        raise
    finally:
        await github_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
