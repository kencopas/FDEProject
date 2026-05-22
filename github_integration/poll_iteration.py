from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from campaign_api.client import Campaign, CampaignApiClient
from config import get_logger
from github_api.client import GitHubIssuesApiClient
from campaign_api.service import (
    campaign_id,
    campaigns_over_threshold,
    fetch_all_campaigns,
)
from utils import batched
from github_api.service import (
    build_issue_body,
    build_issue_title,
    list_open_issue_titles,
)

logger = get_logger(__name__)
ISSUE_CREATION_BATCH_SIZE = 5


async def run_poll_iteration(
    campaign_client: CampaignApiClient,
    github_client: GitHubIssuesApiClient,
    *,
    owner: str,
    repo: str,
    budget_alert_threshold: float,
) -> None:
    campaigns = await fetch_all_campaigns(campaign_client)
    over_threshold = campaigns_over_threshold(campaigns, budget_alert_threshold)
    open_titles = await list_open_issue_titles(github_client, owner, repo)
    created_count = 0

    logger.info(f"Number of campaigns: {len(campaigns)}")

    to_create: list[tuple[str, Campaign, float]] = []

    for campaign, utilization in over_threshold:
        title = build_issue_title(campaign, budget_alert_threshold)
        if title in open_titles:
            logger.warning(f"Skipping campaign issue title: {title}")
            continue
        logger.info(f"Creating campaign issue title: {title}")
        open_titles.add(title)
        to_create.append((title, campaign, utilization))

    for batch in batched(to_create, ISSUE_CREATION_BATCH_SIZE):
        tasks = [
            github_client.create_issue(
                owner=owner,
                repo=repo,
                title=title,
                body=build_issue_body(campaign, utilization, budget_alert_threshold),
                labels=["campaign", "budget-alert"],
            )
            for title, campaign, utilization in batch
        ]
        created_batch = await asyncio.gather(*tasks)
        created_count += len(created_batch)

        for created, (_, campaign, _) in zip(created_batch, batch, strict=True):
            issue_number = created.get("number")
            issue_url = created.get("html_url")
            logger.info(
                "Created issue "
                f"#{issue_number} for campaign {campaign_id(campaign)}"
                f" ({issue_url if issue_url else 'no url returned'})"
            )

    logger.info(
        f"Poll complete at {datetime.now(tz=UTC).isoformat()} | "
        f"campaigns={len(campaigns)} | over_threshold={len(over_threshold)} | "
        f"issues_created={created_count}"
    )
