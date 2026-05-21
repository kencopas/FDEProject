from __future__ import annotations

import asyncio
import os

from pydantic import ValidationError

from config import CampaignApiSettings, GitHubApiSettings, get_logger, setup_logging
from poll_iteration import run_poll_iteration
from github_api.client import GitHubApiError, GitHubIssuesApiClient
from campaign_api.client import CampaignApiError, CampaignApiClient

POLL_INTERVAL_SECONDS = 10
BUDGET_ALERT_THRESHOLD = 0.9
DEFAULT_GITHUB_OWNER = "kencopas"
DEFAULT_GITHUB_REPO = "FDEProject"

logger = get_logger(__name__)


async def main() -> None:
    setup_logging()

    try:
        campaign_settings = CampaignApiSettings()
        github_settings = GitHubApiSettings()
    except ValidationError as exc:
        logger.error("Invalid configuration from environment variables")
        logger.error("%s", exc)
        return

    campaign_client = CampaignApiClient(
        base_url=str(campaign_settings.campaign_api_base_url),
        api_key=campaign_settings.campaign_api_key,
        timeout=campaign_settings.campaign_api_timeout,
        user_agent=campaign_settings.campaign_api_user_agent,
    )
    github_client = GitHubIssuesApiClient(
        token=github_settings.github_token,
        base_url=str(github_settings.github_api_base_url),
        api_version=github_settings.github_api_version,
        timeout=github_settings.github_api_timeout,
        user_agent=github_settings.github_api_user_agent,
    )

    owner = os.getenv("GITHUB_REPO_OWNER", DEFAULT_GITHUB_OWNER)
    repo = os.getenv("GITHUB_REPO_NAME", DEFAULT_GITHUB_REPO)

    logger.info(
        "Starting campaign monitor "
        f"for {owner}/{repo} with poll interval {POLL_INTERVAL_SECONDS}s"
    )

    try:
        while True:
            try:
                await run_poll_iteration(
                    campaign_client,
                    github_client,
                    owner=owner,
                    repo=repo,
                    budget_alert_threshold=BUDGET_ALERT_THRESHOLD,
                )
            except CampaignApiError as exc:
                logger.error("Campaign API error during poll: %s", exc)
            except GitHubApiError as exc:
                logger.error("GitHub API error during poll: %s", exc)

            await asyncio.sleep(POLL_INTERVAL_SECONDS)
    except KeyboardInterrupt:
        logger.info("Campaign monitor stopped by user")
    finally:
        await asyncio.gather(
            campaign_client.aclose(),
            github_client.aclose(),
            return_exceptions=True,
        )


if __name__ == "__main__":
    asyncio.run(main())
