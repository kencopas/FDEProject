from __future__ import annotations

import logging
import os
from pathlib import Path

from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


def setup_logging() -> None:
    """Initialize basic application logging once."""
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    log_file_path = os.getenv("LOG_FILE_PATH", "logs/github_integration.log")
    log_file = Path(log_file_path)
    log_file.parent.mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    has_console_handler = any(
        isinstance(handler, logging.StreamHandler)
        and not isinstance(handler, logging.FileHandler)
        for handler in root_logger.handlers
    )
    if not has_console_handler:
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)

    absolute_log_file = str(log_file.resolve())
    has_file_handler = any(
        isinstance(handler, logging.FileHandler)
        and getattr(handler, "baseFilename", None) == absolute_log_file
        for handler in root_logger.handlers
    )
    if not has_file_handler:
        file_handler = logging.FileHandler(absolute_log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


class CampaignApiSettings(BaseSettings):
    """Application settings loaded from environment variables and .env."""

    campaign_api_base_url: HttpUrl = Field(
        default="http://localhost:8000",
        description="Base URL for the Campaign API.",
    )
    campaign_api_key: str | None = Field(
        default=None,
        description="Optional API key sent as x-api-key.",
    )
    campaign_api_timeout: float = Field(
        default=1.0,
        gt=0,
        le=120,
        description="HTTP timeout in seconds (capped at 1.0 by CampaignApiClient).",
    )
    campaign_api_user_agent: str = Field(
        default="github-integration/0.1",
        min_length=1,
        description="User-Agent header value for outbound API requests.",
    )


class GitHubApiSettings(BaseSettings):
    """GitHub REST API settings loaded from environment variables and .env."""

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
