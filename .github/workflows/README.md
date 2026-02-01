# GitHub Actions Workflows

This directory contains automated workflows for managing the d0s catalog.

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     NIGHTLY PIPELINE (2 AM UTC)                          │
│                                                                          │
│  ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │ Discover │ -> │  Update   │ -> │  Build   │ -> │ Commit & Refresh │  │
│  │   Apps   │    │ Versions  │    │ Packages │    │    Catalog       │  │
│  └──────────┘    └───────────┘    └──────────┘    └────────┬─────────┘  │
│                                                             │            │
│                                    ┌────────────────────────┘            │
│                                    v                                     │
│                           ┌────────────────┐                            │
│                           │ Discord Notify │                            │
│                           └───────┬────────┘                            │
│                                   │                                      │
└───────────────────────────────────┼──────────────────────────────────────┘
                                    v
                    ┌───────────────────────────────┐
                    │   repository_dispatch to      │
                    │   d0s-dev/site                │
                    └───────────────┬───────────────┘
                                    v
                    ┌───────────────────────────────┐
                    │   Site Rebuild (GitHub Pages) │
                    └───────────────────────────────┘
```

## Workflows

### 🌙 `nightly-pipeline.yml` (Main Pipeline)

**Schedule:** Daily at 2 AM UTC

The primary automation workflow that updates, builds, and scans all catalog apps.

**Jobs:**
1. **Discover** - Dynamically finds all apps in `catalog/*/manifest.json`
2. **Update** - Checks upstream Helm repos for new versions (N+3 strategy)
3. **Build** - Parallel builds using matrix strategy (max 3 concurrent)
   - Generates `zarf.yaml` for each version
   - Builds Zarf packages with SBOMs
   - Runs CVE scans using Grype
   - Writes `builtAt` and `scannedAt` timestamps
4. **Commit** - Aggregates changes and commits to main
5. **Notify** - Sends Discord summary
6. **Trigger Site** - Dispatches event to rebuild d0s.dev

**Features:**
- ✅ Dynamic app discovery (no hardcoded list)
- ✅ Self-hosted runners for faster builds
- ✅ `fail-fast: false` - failures don't stop other apps
- ✅ Timestamps on all builds and scans
- ✅ Discord notifications with CVE summary
- ✅ Automatic site rebuild trigger

**Triggers:**
- Scheduled (nightly at 2 AM UTC)
- Manual dispatch with options:
  - `apps` - Comma-separated list or "all"
  - `skip_build` - Scan only, no builds
  - `versions_to_build` - Override N+3 default

---

### 🔍 `nightly-scan.yml` (Standalone Scans)

**Schedule:** Daily at 4 AM UTC (or triggered after nightly-pipeline)

Additional CVE scanning that can run independently or as a follow-up.

**Jobs:**
1. **Scan Catalog** - Runs Grype scans on all SBOMs
2. **Notify** - Discord notification with CVE totals
3. **Trigger Site** - Dispatches site rebuild if changes detected

**Triggers:**
- `workflow_run` - After nightly-pipeline completes successfully
- Scheduled (daily at 4 AM UTC)
- Manual dispatch with options:
  - `scan_all_versions` - Scan all versions, not just latest 3
  - `send_notification` - Enable/disable Discord

---

### 📝 `refresh-catalog.yml`

**Schedule:** Daily at 6 AM UTC (backup) + on push to manifest files

Regenerates `apps.json` and `cves.json` from all manifests.

**Actions:**
- Validates all manifests against schema
- Runs `d0s catalog refresh`
- Commits updated catalog index

**Triggers:**
- Scheduled (daily at 6 AM UTC)
- Push to `catalog/*/manifest.json`
- Manual dispatch

---

### ➕ `add-new-app.yml`

**Manual trigger only**

Scaffolds a new app from a Helm chart and creates a PR.

**Inputs:**
- `chart_name` - Helm chart name (e.g., `redis`, `ingress-nginx`)
- `chart_repo` - Helm repository URL
- `chart_version` - Optional specific version

**Actions:**
1. Runs `d0s catalog add` to scaffold app
2. Generates `zarf.yaml` for latest 3 versions
3. Runs initial CVE scan
4. Creates PR with scan results summary

---

### 🔧 `manual-build.yml`

**Manual trigger only**

Build specific apps on-demand outside of nightly schedule.

**Inputs:**
- `app` - App name to build
- `version` - Optional specific version
- `arch` - Architecture (amd64, arm64, or both)

---

## Required Secrets

| Secret | Description |
|--------|-------------|
| `GITHUB_TOKEN` | Auto-provided for repo actions |
| `GH_PAT` | Personal access token for cross-repo dispatch |
| `DISCORD_WEBHOOK_URL` | Discord webhook for notifications |

## Required Runners

The build workflows use self-hosted runners for performance:

```yaml
runs-on: [self-hosted, Linux, X64]
```

Ensure at least 3 runners are available for parallel matrix builds.

## d0s CLI Commands Used

| Command | Description |
|---------|-------------|
| `d0s catalog update --all` | Check for new upstream versions |
| `d0s catalog add` | Scaffold new app from Helm chart |
| `d0s package generate` | Generate `zarf.yaml` from template |
| `d0s catalog build-all` | Build packages with SBOMs |
| `d0s catalog scan` | Run Grype CVE scans |
| `d0s catalog refresh` | Regenerate `apps.json` |
| `d0s catalog cve-db` | Generate central `cves.json` |
| `d0s internal scan-catalog` | Batch scan entire catalog |
| `d0s internal notify` | Send Discord notifications |

## Timestamps

All builds and scans write ISO 8601 timestamps:

```json
{
  "versions": [{
    "version": "1.2.3",
    "builtAt": "2026-01-31T02:15:30Z",
    "scannedAt": "2026-01-31T02:16:45Z",
    "aggregates": {
      "critical": 0,
      "high": 2,
      "medium": 5,
      "low": 10
    }
  }]
}
```

These timestamps are displayed on the d0s.dev catalog pages.

## Version Retention

- **N+3 Strategy**: Latest 3 versions are built nightly
- **All versions preserved**: Older version scan data is kept
- **No automatic cleanup**: Historical data for trend analysis
