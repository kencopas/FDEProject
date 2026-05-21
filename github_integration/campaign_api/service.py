from __future__ import annotations

from campaign_api.client import Campaign, CampaignApiClient


def campaign_id(campaign: Campaign) -> str:
    return campaign.id.strip() if campaign.id.strip() else "unknown"


def campaign_name(campaign: Campaign) -> str:
    return campaign.name.strip() if campaign.name.strip() else "Unnamed"


def fetch_all_campaigns(client: CampaignApiClient) -> list[Campaign]:
    page = 1
    page_size = 10
    campaigns: list[Campaign] = []
    total: int | None = None

    while True:
        response = client.list_campaigns(page=page, page_size=page_size)
        page_campaigns = response.campaigns

        if total is None:
            total = response.total

        if not page_campaigns:
            break

        campaigns.extend(page_campaigns)

        if total is not None and len(campaigns) >= total:
            break

        if len(page_campaigns) < page_size:
            break

        page += 1

    return campaigns


def utilization(campaign: Campaign) -> float | None:
    if campaign.budget <= 0:
        return None
    return campaign.spend / campaign.budget


def campaigns_over_threshold(
    campaigns: list[Campaign], threshold: float
) -> list[tuple[Campaign, float]]:
    over_threshold: list[tuple[Campaign, float]] = []

    for campaign in campaigns:
        usage = utilization(campaign)
        if usage is None:
            continue
        if usage >= threshold:
            over_threshold.append((campaign, usage))

    return over_threshold
