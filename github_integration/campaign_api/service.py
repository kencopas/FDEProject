from __future__ import annotations

import math

from campaign_api.client import Campaign, CampaignApiClient


def campaign_id(campaign: Campaign) -> str:
    return campaign.id.strip() if campaign.id.strip() else "unknown"


def campaign_name(campaign: Campaign) -> str:
    return campaign.name.strip() if campaign.name.strip() else "Unnamed"


async def fetch_all_campaigns(
    client: CampaignApiClient,
    *,
    page_size: int = 10,
    batch_size: int = 5,
) -> list[Campaign]:
    if page_size < 1:
        raise ValueError("page_size must be >= 1")
    if batch_size < 1:
        raise ValueError("batch_size must be >= 1")

    first_page = await client.list_campaigns(page=1, page_size=page_size)
    campaigns: list[Campaign] = []
    seen_campaign_ids: set[str] = set()

    def append_unique(items: list[Campaign]) -> int:
        added = 0
        for item in items:
            if item.id in seen_campaign_ids:
                continue
            seen_campaign_ids.add(item.id)
            campaigns.append(item)
            added += 1
        return added

    append_unique(first_page.campaigns)

    total_hint = max(first_page.total, len(campaigns))
    max_pages = max(1, math.ceil(total_hint / page_size) + 2)

    if len(campaigns) >= total_hint:
        return campaigns

    page = 2
    while page <= max_pages:
        response = await client.list_campaigns(page=page, page_size=page_size)
        if not response.campaigns:
            break

        added_this_page = append_unique(response.campaigns)

        if len(response.campaigns) < page_size:
            break

        # If no new IDs are discovered on a full page, pagination has likely
        # become inconsistent due to shifting windows between requests.
        if added_this_page == 0:
            break

        if len(campaigns) >= total_hint:
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
