from __future__ import annotations

from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class CampaignApiSettings(BaseSettings):
    """Application settings loaded from environment variables and .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    campaign_api_base_url: HttpUrl = Field(
        default="http://localhost:8000",
        description="Base URL for the Campaign API.",
    )
    campaign_api_key: str | None = Field(
        default=None,
        description="Optional API key sent as x-api-key.",
    )
    campaign_api_timeout: float = Field(
        default=10.0,
        gt=0,
        le=120,
        description="HTTP timeout in seconds.",
    )
    campaign_api_user_agent: str = Field(
        default="github-integration/0.1",
        min_length=1,
        description="User-Agent header value for outbound API requests.",
    )


class GitHubApiSettings(BaseSettings):
    """GitHub REST API settings loaded from environment variables and .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    github_token: str = Field(
        ...,
        min_length=1,
        description="GitHub token used for Authorization: Bearer <token>.",
    )
    github_api_base_url: HttpUrl = Field(
        default="https://api.github.com",
        description="Base URL for GitHub REST API.",
    )
    github_api_version: str = Field(
        default="2026-03-10",
        min_length=1,
        description="X-GitHub-Api-Version request header value.",
    )
    github_api_timeout: float = Field(
        default=10.0,
        gt=0,
        le=120,
        description="HTTP timeout in seconds for GitHub API requests.",
    )
    github_api_user_agent: str = Field(
        default="github-integration/0.1",
        min_length=1,
        description="User-Agent header value for outbound GitHub requests.",
    )
