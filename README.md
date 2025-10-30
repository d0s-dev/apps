# D0S Application Catalog

A comprehensive catalog of containerized applications with integrated security scanning, SBOMs, and Zarf packaging for Kubernetes deployments.

## Overview

This repository contains:
- **Application manifests** with detailed metadata and security information
- **Zarf package definitions** for one-click Kubernetes deployments
- **Software Bill of Materials (SBOMs)** generated using Syft
- **Vulnerability scans** performed using Grype
- **Automated tooling** for catalog management and validation

## Repository Structure

```
apps/
├── catalog/
│   ├── apps.json                    # Master catalog consumed by website
│   ├── nginx/                       # Example application
│   │   ├── manifest.json           # Detailed app metadata
│   │   ├── sboms/                   # Software Bill of Materials
│   │   │   └── vendor/1.25.0/
│   │   │       └── nginx-alpine.syft.json
│   │   ├── scans/                   # Vulnerability scan reports
│   │   │   └── vendor/1.25.0/
│   │   │       └── nginx-alpine.grype.json
│   │   └── zarf/
│   │       └── zarf.yaml           # Zarf package definition
│   └── [other-apps]/
├── schemas/                         # JSON schemas for validation
│   ├── catalog.schema.json
│   └── manifest.schema.json
├── catalog.js                       # Catalog management script
├── package.json                     # Node.js dependencies
├── CONTRIBUTING.md                  # Guide for adding new apps
└── WEBSITE_INTEGRATION.md          # Guide for website updates
```

## Available Applications

| Application | Version | Providers | CVEs (C/H/M/L) | Images |
|-------------|---------|-----------|----------------|---------|
| Grafana | 10.2.0 | vendor, ironbank | 1/1/5/8 | 3 |
| Keycloak | 23.0.0 | vendor, chainguard | 0/2/5/8 | 2 |
| Nginx | 1.25.0 | vendor, chainguard | 0/1/2/4 | 2 |
| PostgreSQL | 15.3 | vendor, ironbank | 0/0/3/6 | 2 |
| Redis | 7.2.0 | vendor, chainguard | 0/0/1/4 | 2 |
| Vault | 1.15.0 | vendor, ironbank | 0/0/1/3 | 2 |

*Last updated: 2025-10-29*

## Quick Start

### Prerequisites
- Node.js 16+
- Docker (for generating SBOMs/scans)
- Zarf CLI (for package management)
- Grype CLI (for vulnerability scanning)
- Syft CLI (for SBOM generation)

### Setup
```bash
# Clone the repository
git clone https://github.com/d0s-dev/apps.git
cd apps

# Install dependencies
npm install

# Validate all manifests
npm run validate

# Generate/refresh the master catalog
npm run refresh
```

### Deploying Applications

Using the d0s CLI:
```bash
# Deploy an application
d0s deploy nginx

# Deploy specific provider variant
d0s deploy nginx --provider chainguard

# List available applications
d0s catalog list
```

Using Zarf directly:
```bash
# Deploy from OCI registry
zarf package deploy oci://ghcr.io/d0s-dev/nginx:1.25.0

# Deploy from local package
zarf package deploy catalog/nginx/zarf/zarf.yaml
```

## Catalog Management

### Available Commands

```bash
# Validate all app manifests against JSON schema
npm run validate

# Refresh aggregated data and regenerate apps.json
npm run refresh

# Run both validation and refresh
npm run build

# Format JSON files
npx prettier --write "catalog/**/*.json"
```

### Adding New Applications

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed instructions on adding new applications to the catalog.

### Updating Security Data

Security scans are automatically refreshed when you run `npm run refresh`. The script:
1. Re-parses all Grype scan results
2. Updates CVE counts in manifest aggregates
3. Sets `lastScanned` timestamps
4. Regenerates the master catalog

## Security Information

### Vulnerability Scanning

All container images undergo security scanning using [Grype](https://github.com/anchore/grype):
- **Daily automated scans** via CI/CD pipeline
- **Multi-provider comparison** (vendor vs hardened images)
- **Severity-based categorization** (Critical, High, Medium, Low)
- **Detailed CVE information** with fix recommendations

### Software Bill of Materials (SBOM)

SBOMs are generated using [Syft](https://github.com/anchore/syft) and include:
- **Complete package inventory** for all container images
- **License information** for compliance tracking
- **Dependency relationships** and origins
- **SPDX-compatible format** for tool integration

### Provider Variants

Multiple image sources are supported:

- **vendor**: Official upstream images
- **chainguard**: Distroless images with minimal attack surface  
- **ironbank**: Hardened images from Platform One Iron Bank

## API Reference

### Catalog Endpoint
```
GET /catalog/apps.json
```
Returns the master catalog with all applications and summary data.

### App Manifest Endpoint
```
GET /catalog/{app-id}/manifest.json
```
Returns detailed information for a specific application.

### Example Response (apps.json)
```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-10-29T06:00:00Z",
  "apps": [
    {
      "id": "nginx",
      "name": "Nginx", 
      "summary": "High-performance web server and reverse proxy",
      "labels": ["web", "proxy", "networking"],
      "providers": ["vendor", "chainguard"],
      "hasIronBank": false,
      "hasChainguard": true,
      "imageCount": 2,
      "cves": { "critical": 0, "high": 1, "medium": 2, "low": 4 },
      "latestVersion": "1.25.0",
      "zarfPackage": "catalog/nginx/zarf/zarf.yaml",
      "links": { /* upstream links */ }
    }
  ]
}
```

## Website Integration

The catalog data is designed for consumption by the d0s website. See [WEBSITE_INTEGRATION.md](WEBSITE_INTEGRATION.md) for:
- Data loading patterns
- React component updates
- Caching strategies
- Error handling

## Development

### Project Scripts

```json
{
  "validate": "node catalog.js validate",
  "refresh": "node catalog.js refresh", 
  "build": "npm run validate && npm run refresh",
  "test": "npm run validate"
}
```

### JSON Schema Validation

All data structures are validated against JSON schemas:
- `schemas/catalog.schema.json` - Master catalog format
- `schemas/manifest.schema.json` - Individual app manifest format

### CI/CD Integration

The catalog supports automated workflows:
1. **Pull Request Validation**: Ensures new/modified manifests are valid
2. **Nightly Security Scans**: Updates vulnerability data
3. **Release Automation**: Publishes updated catalog data

Example GitHub Actions workflow:
```yaml
name: Refresh Catalog
on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run refresh
      - name: Commit updated catalog
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action" 
          git add catalog/apps.json
          git diff --staged --quiet || git commit -m "chore: refresh catalog data [skip ci]"
          git push
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Adding new applications
- Updating existing apps
- Improving tooling and automation
- Security scanning enhancements

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: See guides in this repository
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Join our community for questions and ideas
- **Security**: Report vulnerabilities via our security policy

---

**Maintained by the d0s-dev team**