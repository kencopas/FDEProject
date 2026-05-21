from __future__ import annotations

from datetime import UTC, datetime

from campaign_api.client import Campaign
from campaign_api.service import campaign_id, campaign_name
from github_api.client import GitHubIssuesApiClient


def build_issue_title(campaign: Campaign, threshold: float) -> str:
    threshold_percent = int(threshold * 100)
    return (
        f"[Campaign Budget Alert] {campaign_id(campaign)} exceeded "
        f"{threshold_percent}% budget"
    )


def build_issue_body(
    campaign: Campaign, utilization_value: float, threshold: float
) -> str:
    spend = campaign.spend
    budget = campaign.budget
    remaining = budget - spend
    threshold_percent = int(threshold * 100)

    now = datetime.now(tz=UTC).isoformat()
    return "\n".join(
        [
            "## Budget Threshold Alert",
            "",
            (
                f"A campaign has crossed the {threshold_percent}% "
                "spend threshold and needs review."
            ),
            "",
            f"- Campaign ID: {campaign_id(campaign)}",
            f"- Campaign Name: {campaign_name(campaign)}",
            f"- Advertiser: {campaign.advertiser}",
            f"- Status: {campaign.status}",
            f"- Budget: ${budget:,.2f}",
            f"- Spend: ${spend:,.2f}",
            f"- Remaining Budget: ${remaining:,.2f}",
            f"- Utilization: {utilization_value * 100:.2f}%",
            f"- Start Date: {campaign.start_date.isoformat()}",
            f"- End Date: {campaign.end_date.isoformat()}",
            f"- Detected At (UTC): {now}",
            "",
            "## Recommended Actions",
            "",
            "1. Confirm whether spend pacing is expected for this campaign.",
            "2. If needed, pause the campaign or adjust budget/targeting.",
            "3. Communicate changes with the campaign owner/advertiser.",
        ]
    )


def list_open_issue_titles(
    github_client: GitHubIssuesApiClient, owner: str, repo: str
) -> set[str]:
    titles: set[str] = set()
    page = 1
    per_page = 100

    while True:
        issues = github_client.list_issues(
            owner=owner,
            repo=repo,
            state="open",
            per_page=per_page,
            page=page,
        )

        if not issues:
            break

        for issue in issues:
            if not isinstance(issue, dict):
                continue
            if "pull_request" in issue:
                continue
            title = issue.get("title")
            if isinstance(title, str) and title.strip():
                titles.add(title.strip())

        if len(issues) < per_page:
            break

        page += 1

    return titles
