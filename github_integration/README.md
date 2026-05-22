# GitHub Integration Service

This service polls the Campaign API and opens GitHub issues when campaign spend crosses a budget utilization threshold.

## What It Does

- Polls Campaign API every 10 seconds.
- Fetches campaigns and identifies those at or above 90% budget utilization.
- Lists open GitHub issues and skips creating duplicates (title-based dedupe).
- Creates new GitHub issues in batches with labels: `campaign`, `budget-alert`.
- Logs to console and to `logs/github_integration.log`.

Current behavior is implemented in:

- `main.py`
- `poll_iteration.py`
- `campaign_api/service.py`
- `github_api/service.py`

## Project Structure

- `campaign_api/client.py`: async Campaign API client (`/health`, `/next-day`, `/campaigns`, `/campaigns/{id}`, `/api-docs`)
- `campaign_api/service.py`: campaign pagination/dedupe and threshold logic
- `github_api/client.py`: async GitHub Issues REST client
- `github_api/service.py`: issue title/body construction and open-title lookup
- `poll_iteration.py`: one monitoring cycle
- `main.py`: continuous poll loop and client lifecycle management
- `scripts/close_all_issues.py`: utility script to close all open issues in the configured repo
- `config.py`: environment configuration and logging setup

## Requirements

- Python 3.12+
- A reachable Campaign API
- A GitHub token with issue read/write permissions for the target repo

Install dependencies:

```bash
pip install -r requirements.txt
```

## Configuration

Settings are loaded from environment variables and optional `.env` in this directory.

### Campaign API

- `CAMPAIGN_API_BASE_URL` (default: `http://localhost:8000`)
- `CAMPAIGN_API_KEY` (optional)
- `CAMPAIGN_API_TIMEOUT` (default: `1.0`)
- `CAMPAIGN_API_USER_AGENT` (default: `github-integration/0.1`)

Note: request timeout for Campaign API calls is capped to 1.0 second in the client.

### GitHub API

- `GITHUB_TOKEN` (required)
- `GITHUB_API_BASE_URL` (default: `https://api.github.com`)
- `GITHUB_API_VERSION` (default: `2026-03-10`)
- `GITHUB_API_TIMEOUT` (default: `10.0`)
- `GITHUB_API_USER_AGENT` (default: `github-integration/0.1`)

### Target Repository

- `GITHUB_REPO_OWNER` (default: `kencopas`)
- `GITHUB_REPO_NAME` (default: `FDEProject`)

### Logging

- `LOG_LEVEL` (default: `INFO`)
- `LOG_FILE_PATH` (default: `logs/github_integration.log`)

Example `.env`:

```env
CAMPAIGN_API_BASE_URL=http://localhost:8000
CAMPAIGN_API_KEY=
CAMPAIGN_API_TIMEOUT=1.0
CAMPAIGN_API_USER_AGENT=github-integration/0.1

GITHUB_TOKEN=
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_API_VERSION=2026-03-10
GITHUB_API_TIMEOUT=10.0
GITHUB_API_USER_AGENT=github-integration/0.1

GITHUB_REPO_OWNER=kencopas
GITHUB_REPO_NAME=FDEProject

LOG_LEVEL=INFO
LOG_FILE_PATH=logs/github_integration.log
```

## Run Locally

From `github_integration/`:

```bash
python main.py
```

The process runs until interrupted and executes one poll iteration every 10 seconds.

## Utility Script

Close all open issues in the configured repository:

```bash
python scripts/close_all_issues.py
```

The script skips pull requests and closes issues in batches.

## Docker

Build image:

```bash
docker build -t github-integration:latest .
```

Run container:

```bash
docker run --rm \
  --env-file .env \
  -e CAMPAIGN_API_BASE_URL=http://host.docker.internal:8000 \
  -v "$(pwd)/logs:/app/logs" \
  github-integration:latest
```

Or with Compose:

```bash
docker compose up --build
```

## Notes

- Existing open issue titles are used to avoid duplicate alerts.
- Issue title format: `[Campaign Budget Alert] <campaign_id> exceeded 90% budget`.
- `POLL_INTERVAL_SECONDS` and `BUDGET_ALERT_THRESHOLD` are currently fixed constants in `main.py`.
