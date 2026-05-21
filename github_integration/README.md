# GitHub Integration

This project now includes a reusable Campaign API client in
`campaign_api_client.py`.

It also includes a reusable GitHub Issues REST API client in
`github_issues_api_client.py`.

Configuration is handled by a `pydantic-settings` class in
`settings.py`, which automatically loads values from environment
variables and an optional `.env` file in this folder.

## Available Client Methods

- `health()` -> `GET /health`
- `next_day()` -> `POST /next-day`
- `list_campaigns(page=1, page_size=10, status=None, api_key=None)` -> `GET /campaigns`
- `get_campaign(campaign_id, api_key=None)` -> `GET /campaigns/{campaign_id}`
- `api_docs()` -> `GET /api-docs`

## GitHub Issues Client Methods

- `list_issues(owner, repo, ...)` -> `GET /repos/{owner}/{repo}/issues`
- `get_issue(owner, repo, issue_number)` -> `GET /repos/{owner}/{repo}/issues/{issue_number}`
- `create_issue(owner, repo, title=..., ...)` -> `POST /repos/{owner}/{repo}/issues`
- `update_issue(owner, repo, issue_number, ...)` -> `PATCH /repos/{owner}/{repo}/issues/{issue_number}`

Authentication uses:

- `Authorization: Bearer <token>`
- `Accept: application/vnd.github+json`
- `X-GitHub-Api-Version: 2026-03-10`

## Usage

Set environment variables:

- `CAMPAIGN_API_BASE_URL` (default: `http://localhost:8000`, must be a valid URL)
- `CAMPAIGN_API_KEY` (optional)
- `CAMPAIGN_API_TIMEOUT` (default: `10.0`, must be > 0 and <= 120)
- `CAMPAIGN_API_USER_AGENT` (default: `github-integration/0.1`, cannot be empty)

For the GitHub client:

- `GITHUB_TOKEN` (required)
- `GITHUB_API_BASE_URL` (default: `https://api.github.com`)
- `GITHUB_API_VERSION` (default: `2026-03-10`)
- `GITHUB_API_TIMEOUT` (default: `10.0`)
- `GITHUB_API_USER_AGENT` (default: `github-integration/0.1`)

You can also create a `.env` file:

```env
CAMPAIGN_API_BASE_URL=http://localhost:8000
CAMPAIGN_API_KEY=
CAMPAIGN_API_TIMEOUT=10
CAMPAIGN_API_USER_AGENT=github-integration/0.1
GITHUB_TOKEN=
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_API_VERSION=2026-03-10
GITHUB_API_TIMEOUT=10
GITHUB_API_USER_AGENT=github-integration/0.1
```

Run the example:

```bash
python main.py
```

Run GitHub Issues client validation against `kencopas/FDEProject`:

```bash
python test_github_issues_client.py
```

This script validates `list_issues`, `create_issue`, `get_issue`, and `update_issue`.
It creates a temporary issue and closes it as part of the test.

Or use the client directly:

```python
from campaign_api_client import CampaignApiClient

client = CampaignApiClient(base_url="http://localhost:8000", api_key="optional-key")
campaigns = client.list_campaigns(page=1, page_size=10)
print(campaigns)

from github_issues_api_client import GitHubIssuesApiClient

gh = GitHubIssuesApiClient(token="ghp_your_token")

# List issues
issues = gh.list_issues("OWNER", "REPO", state="open", per_page=10, page=1)

# Create an issue
created = gh.create_issue("OWNER", "REPO", title="Bug report", body="Details")

# Get one issue
issue = gh.get_issue("OWNER", "REPO", issue_number=created["number"])

# Update an issue
updated = gh.update_issue(
	"OWNER",
	"REPO",
	issue_number=issue["number"],
	state="closed",
	state_reason="completed",
)

print(updated["state"])
```
