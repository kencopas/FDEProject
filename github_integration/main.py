from __future__ import annotations

from pydantic import ValidationError

from campaign_api_client import CampaignApiClient, CampaignApiError
from github_issues_api_client import GitHubApiError, GitHubIssuesApiClient
from settings import CampaignApiSettings, GitHubApiSettings


def main() -> None:
    try:
        settings = CampaignApiSettings()
    except ValidationError as exc:
        print("Invalid configuration from environment variables:")
        print(exc)
        return

    client = CampaignApiClient(
        base_url=str(settings.campaign_api_base_url),
        api_key=settings.campaign_api_key,
        timeout=settings.campaign_api_timeout,
        user_agent=settings.campaign_api_user_agent,
    )

    try:
        health = client.health()
        print("Campaign API health response:")
        print(health)
    except CampaignApiError as exc:
        print(f"Campaign API error: {exc}")

    try:
        github_settings = GitHubApiSettings()
        github_client = GitHubIssuesApiClient(
            token=github_settings.github_token,
            base_url=str(github_settings.github_api_base_url),
            api_version=github_settings.github_api_version,
            timeout=github_settings.github_api_timeout,
            user_agent=github_settings.github_api_user_agent,
        )
        print("GitHub Issues API client initialized successfully.")

        issues = github_client.list_issues(
            owner="kencopas",
            repo="FDEProject",
            state="open",
            per_page=1,
            page=1,
        )
        print(f"GitHub Issues API list check succeeded. Retrieved {len(issues)} item(s).")
    except ValidationError as exc:
        print("GitHub client not initialized. Missing or invalid GitHub settings:")
        print(exc)
    except GitHubApiError as exc:
        print(f"GitHub API error: {exc}")


if __name__ == "__main__":
    main()
