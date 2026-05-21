# Forward Deployed Engineer — Final Round Project

## Overview

Welcome to the final round of the interview process. We'd like you to build a small but real integration project that we'll review together during your interview. This is an opportunity to show us how you think about building reliable software systems.

---

## The Task

We'll provide you with a **Docker container** that exposes a REST API representing a fictional ad campaign data service. You need to build two things:

### 1. A Browser UI

Build a browser-based UI that displays campaign data from the API. At minimum it should show the list of campaigns and their key fields (name, advertiser, budget, spend, status). How you build it — framework, styling, layout — is entirely up to you.

### 2. A Scheduled Integration

Build a scheduled job that:

1. **Polls the campaign API** every **10 seconds**
2. **Evaluates the campaign data** returned by the API
3. **Creates a GitHub Issue** in your repo for any campaign where spend has exceeded 90% of its budget

Each issue should contain enough information for someone to act on it.

---

## Setup

### Running the API

```bash
docker pull didelta50/4289329224:latest
docker run -p 8080:8080 didelta50/4289329224:latest
```

The API will be available at `http://localhost:8080`. See the `/docs` and `/api-docs` endpoints for documentation.

### Advancing the Simulation

The container includes a `/next-day` endpoint (no auth required) that advances the simulation, increasing spend on campaigns so that new ones cross the 90% threshold. Calling it 5 times moves all campaigns over the threshold. Restarting the docker container will reset it back to the starting place.

### GitHub Access

Use the **GitHub REST API** with a **Personal Access Token** to create issues in your repo. Interact with the API directly or via a lightweight HTTP client — do not use a high-level GitHub SDK.

---

## What to Deliver

Submit a **GitHub repo** containing:

1. **Working code** for both the UI and the scheduled integration
2. **A README** with clear instructions for how to run your project locally — we should be able to clone it, follow the steps, and have everything running
3. **A short design doc** (`DESIGN.md`) covering:
   - How your system works at a high level
   - What failure modes you considered and how you handled them
   - What you would do differently or improve with more time
   - Any assumptions made

---

## What We're Evaluating

- **Does it work?** We'll run both demos live during the interview.
- **Can you explain your decisions?** We'll read your code before the interview and ask specific questions about it.

---

## Notes

- **Use AI coding tools freely.** We expect it. What we're evaluating is your judgment and architecture.
- **Language and framework are your choice.** Use whatever you're most productive in.
- **Timebox yourself.** Budget 4–6 hours at a maximum
- If you are unsure about API or the requirements feel free to make assumptions on what you think makes sense, and explain during the interview.

---

## Interview Format

Your submission will be reviewed before the interview. During the **1-hour session** you will:

- Walk us through your design and key decisions (~20 min)
- Demo the integration running live (~15 min)
- Answer questions about your code and approach (~25 min)

We're looking forward to seeing what you build.
