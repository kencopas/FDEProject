# FDEProject

FDEProject is a multi-service project with:

- A Campaign API container (provided image)
- A Next.js dashboard UI (`dashboard/`)
- A Python GitHub integration worker (`github_integration/`) that polls campaign data and creates GitHub issues

## Architecture At A Glance

- `campaign-api` exposes campaign simulation endpoints (`/campaigns`, `/campaigns/{id}`, `/next-day`, `/health`, `/api-docs`).
- `dashboard` serves the browser UI on port `3000` and calls the Campaign API via internal Next.js route handlers.
- `github-integration` polls the Campaign API every 10 seconds and creates budget-alert GitHub issues for campaigns at or above 90% utilization.

## Repository Layout

- `dashboard/`: Next.js dashboard service
- `github_integration/`: Python polling + GitHub Issues integration service
- `campaign_api_docs.md`: endpoint reference for the provided Campaign API
- `docker-compose.yml`: root compose file to run all services together
- `DESIGN.md`: short design document for this project

## Prerequisites

- Docker Desktop (or Docker Engine + Compose)
- Git
- A GitHub personal access token with repository issue permissions

## Quick Start (Recommended)

These steps run the complete system from a fresh clone.

1. Clone and enter the repo:

```bash
git clone https://www.github.com/kencopas/FDEProject.git
cd FDEProject
```

2. Create `.env` in the project root:

```env
GITHUB_TOKEN=<your_token>
GITHUB_REPO_OWNER=<your-username>
GITHUB_REPO_NAME=<your-repo-name>

GITHUB_API_BASE_URL=https://api.github.com
GITHUB_API_VERSION=2026-03-10
GITHUB_API_TIMEOUT=10.0
GITHUB_API_USER_AGENT=github-integration/0.1

CAMPAIGN_API_TIMEOUT=1.0
CAMPAIGN_API_USER_AGENT=github-integration/0.1
CAMPAIGN_API_KEY= # This can be found at http://localhost:8080/api-docs

LOG_LEVEL=INFO
LOG_FILE_PATH=logs/github_integration.log
```

3. Start all services:

```bash
docker compose up --build
```

4. Open the dashboard:

- [`http://localhost:3000`](http://localhost:3000)

5. Confirm the Campaign API is running:

- [`http://localhost:8080/health`](http://localhost:8080/health)

6. Check integration logs:

```bash
docker compose logs -f github-integration
```

### What You Should See

- Dashboard loads campaigns and supports filtering/sorting/detail modal.
- Clicking "Advance to Next Day" in the dashboard calls `/next-day` and changes campaign spend over time.
- GitHub integration creates issues in the configured repo for campaigns over 90% budget (deduped by title).

## Run Services Individually (Optional)

Running the services individually may require creating localized .env files per service. The alternative is running specific services individually via the root-level `docker-compose.yml`.

### Campaign API only

```bash
docker pull didelta50/4289329224:latest
docker run --rm -p 8080:8080 didelta50/4289329224:latest
```

### Dashboard only

From `dashboard/`:

```bash
npm install
CAMPAIGN_API_BASE_URL=http://localhost:8080 npm run dev
```

Open `http://localhost:3000`.

### GitHub integration only

From `github_integration/`:

```bash
pip install -r requirements.txt
python main.py
```

Ensure the root `.env` exists and points to a reachable Campaign API.

## Stopping The Project

```bash
docker compose down
```

## Troubleshooting

- Dashboard cannot load campaigns:
  - Verify `campaign-api` is healthy on port `8080`.
  - Check `docker compose logs -f dashboard`.
- No GitHub issues are created:
  - Confirm `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, and `GITHUB_REPO_NAME` in the root `.env`.
  - Ensure the token has issue write access.
  - Check `docker compose logs -f github-integration`.
- Reset campaign simulation state:
  - Restart the Campaign API container (`docker compose restart campaign-api`).

## Additional Documentation

- Service details for dashboard: `dashboard/README.md`
- Service details for integration worker: `github_integration/README.md`
- API endpoint reference: `campaign_api_docs.md`
- High-level design: `DESIGN.md`
