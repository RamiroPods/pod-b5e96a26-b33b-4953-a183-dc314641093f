# Agent Pods - Application Developer Guide

## Overview

This guide explains how to prepare and deploy your application on the Agent Pods orchestration platform. The system provides automated hosting for Git-based applications with support for preview environments and production deployments.

## Quick Start

### Prerequisites

Your application must be:

- A Python-based web application (FastAPI is recommended)
- Hosted in a Git repository (GitHub, GitLab, etc.)
- Have a `requirements.txt` file for dependencies
- Expose a FastAPI app at `main:app` (see [Application Structure](#application-structure))

### Getting Started

1. **Create your FastAPI application**
2. **Push your code to a Git repository**
3. **Create an agent** via the panel UI or API
4. **Create an environment** for your branch
5. **Preview and deploy!**

## Application Structure

### Required Files

Your repository must contain the following structure:

```
your-repo/
├── main.py              # Entry point with FastAPI app
├── requirements.txt     # Python dependencies
└── [your other files]   # Your application code
```

### main.py - The Entry Point

The container expects a FastAPI application instance named `app` in a file called `main.py`. This is the **most important requirement**.

**Minimal Example:**

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello from Agent Pods!"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
```

**Why `main:app`?**

The container runs your application using:

```bash
uvicorn main:app --host 0.0.0.0 --port 8001
```

This means it expects:

- A file named `main.py`
- A FastAPI instance named `app` inside that file

### requirements.txt

List all your Python dependencies here. Common dependencies:

```txt
fastapi==0.115.5
pydantic==2.10.2
httpx==0.27.2
# ... your other dependencies
```

**Note:** The base container already includes `uvicorn` and `fastapi`. You can omit them from your requirements.txt if you want, but including them ensures version compatibility.

### Optional Files

You can include any additional Python modules, data files, or resources your application needs:

```
your-repo/
├── main.py
├── requirements.txt
├── models/
│   └── user.py
├── services/
│   └── database.py
├── static/
│   └── assets/
└── config.yaml
```

## Environment Variables

Your application has access to several environment variables injected by the orchestrator:

### Available in Your App

- `MODE` - Either `"PREVIEW"` or `"DEPLOYED"`

  - Use this to enable/disable features based on environment
  - Example: Enable debug logging only in PREVIEW mode

- `WRITER_API_KEY` - Injected API key for secure operations

  - Access via `os.getenv("WRITER_API_KEY")`
  - Use for authenticating with external services

- Standard environment variables:
  - `APP_DIR` - `/app` (your app is mounted here)
  - `HOST` - `0.0.0.0`
  - `APP_PORT` - `8001` (your app runs on this port internally)

### Example Usage

```python
import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

app = FastAPI()
security = HTTPBearer()

MODE = os.getenv("MODE", "PREVIEW")
API_KEY = os.getenv("WRITER_API_KEY")

@app.get("/")
def read_root():
    is_production = MODE == "DEPLOYED"
    return {
        "message": "Hello World",
        "environment": "production" if is_production else "development"
    }

@app.get("/secure-endpoint")
def secure_endpoint(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return {"message": "Access granted"}
```

## Preview vs Deployed Modes

### Preview Mode

**When to use:** Development, testing, feature branches

**How it works:**

1. Your repository is cloned from Git at container startup
2. Dependencies are installed from `requirements.txt`
3. App runs with `--reload` flag for hot-reloading
4. Changes can be pulled via the admin API

**Key Features:**

- Git integration with live code updates
- Hot reload on file changes
- Per-branch isolation
- Slower cold starts (due to git clone + dependency install)

**URL Pattern:**

```
https://your-worker.workers.dev/preview/agent/{agentId}/env/{podEnvId}/
```

### Deployed Mode

**When to use:** Production, stable releases

**How it works:**

1. Container starts and waits for application import
2. Pre-exported snapshot is uploaded from R2 storage
3. App runs without reload (optimized for production)
4. Immutable - code doesn't change

**Key Features:**

- Fast cold starts (no git or dependency install)
- Snapshot-based deployment
- Single container per agent (not per branch)
- Immutable runtime

**URL Pattern:**

```
https://your-worker.workers.dev/deployed/agent/{agentId}/
```

## Development Workflow

### 1. Initial Setup

Use the panel UI or API to create an agent:

```bash
POST /manage/agent
{
  "pod_alias": "my-awesome-app",
  "repo_url": "https://github.com/yourusername/your-repo.git"
}
```

### 2. Create Preview Environment

Create an environment for your branch:

```bash
POST /manage/agent/{agentId}/env
{
  "repo_branch": "main"
}
```

### 3. Test in Preview

Access your preview environment:

```
GET /preview/agent/{agentId}/env/{podEnvId}/
GET /preview/agent/{agentId}/env/{podEnvId}/api/users
```

The first request will:

- Spin up a container
- Clone your repository
- Install dependencies
- Start your FastAPI app
- Show a loading page while preparing (auto-refreshes)

Subsequent requests are instant (container stays alive for 15 minutes).

### 4. Make Changes

**Option A: Push to Git**

1. Push changes to your branch
2. Rebuild the environment:
   ```bash
   GET /rebuild-env/agent/{agentId}/env/{podEnvId}
   ```

**Option B: Pull Latest Changes (without rebuild)**

Use the admin API to pull changes without destroying the container:

```bash
POST /{your-preview-url}/__pod_admin/pull
```

This is faster but only works if your dependencies haven't changed.

### 5. Deploy to Production

When you're ready to deploy:

```bash
GET /deploy/agent/{agentId}/env/{podEnvId}
```

This will:

1. Export your preview environment as a tarball
2. Upload to R2 storage with a new revision number
3. Make it available for deployed mode

### 6. Access Production

Your app is now live at:

```
GET /deployed/agent/{agentId}/
GET /deployed/agent/{agentId}/api/users
```

### 502 Bad Gateway

**Symptoms:** User gets 502 error

**Solutions:**

1. Container might be sleeping - wait a few seconds for wake-up
2. Check if app process is running via logs
3. Verify port 8001 is accessible inside container

## Best Practices

### 1. Always Include a Health Check

```python
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "mode": os.getenv("MODE", "unknown")
    }
```

### 2. Use Structured Logging

```python
import logging
import json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.get("/users")
def get_users():
    logger.info("Fetching users", extra={"count": 42})
    return {"users": [...]}
```

### 3. Handle Startup Failures Gracefully

```python
@app.on_event("startup")
async def startup():
    try:
        # Initialize database, load config, etc.
        pass
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        # Don't raise - let app start anyway
        # Endpoints can return 503 until ready
```

### 4. Separate Dependencies by Environment

Consider using multiple requirements files:

```
requirements.txt          # Shared dependencies
requirements-dev.txt      # Development only
requirements-prod.txt     # Production only
```

Then in your Dockerfile or entrypoint, install based on MODE.

### 5. Version Your API

```python
app = FastAPI(
    title="My API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.get("/v1/users")
def get_users_v1():
    return {"users": [...]}
```

### 6. Document Your Endpoints

FastAPI auto-generates documentation at `/docs` and `/redoc`:

```python
@app.get("/users/{user_id}", summary="Get user by ID")
def get_user(user_id: int):
    """
    Retrieve a user by their unique identifier.

    - **user_id**: The ID of the user to retrieve
    """
    return {"user_id": user_id, "name": "John Doe"}
```

### 7. Test Locally Before Deploying

Run your app locally with the same structure:

```bash
# Install dependencies
pip install -r requirements.txt

# Run with uvicorn
uvicorn main:app --reload --port 8001
```

Visit `http://localhost:8001` to test.

## Resource Limits

The container has the following constraints:

- **Sleep After:** 15 minutes of inactivity

  - Container automatically pauses to save resources
  - Wakes up on next request (adds ~5s latency)

- **Concurrent Instances:** Up to 100 per orchestrator

  - Preview containers: One per agent + environment combination
  - Deployed containers: One per agent + revision

- **Timeout:** 5 minutes for container startup
  - If your app takes longer than this, it will fail
  - Optimize your startup time (pre-install heavy dependencies)
