from __future__ import annotations

import asyncio
import math

from campaign_api.client import Campaign, CampaignApiClient


def campaign_id(campaign: Campaign) -> str:
    return campaign.id.strip() if campaign.id.strip() else "unknown"


def campaign_name(campaign: Campaign) -> str:
    return campaign.name.strip() if campaign.name.strip() else "Unnamed"


def _batched(items: list[int], batch_size: int) -> list[list[int]]:
    return [
        items[index : index + batch_size] for index in range(0, len(items), batch_size)
    ]


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
    campaigns: list[Campaign] = list(first_page.campaigns)
    total = first_page.total

    if total <= len(campaigns):
        return campaigns

    total_pages = math.ceil(total / page_size)
    remaining_pages = list(range(2, total_pages + 1))

    for page_group in _batched(remaining_pages, batch_size):
        responses = await asyncio.gather(
            *[
                client.list_campaigns(page=page, page_size=page_size)
                for page in page_group
            ]
        )
        for response in responses:
            campaigns.extend(response.campaigns)

    if len(campaigns) > total:
        return campaigns[:total]
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
