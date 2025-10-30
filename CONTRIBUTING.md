# Adding New Applications to the D0S Catalog

This guide provides step-by-step instructions for adding new applications to the d0s catalog, including generating the necessary metadata, SBOMs, and security scans.

## Prerequisites

- Node.js 16+ installed
- Docker installed and running
- [Zarf CLI](https://docs.zarf.dev/getting-started/install/) installed
- [Grype CLI](https://github.com/anchore/grype#installation) installed
- [Syft CLI](https://github.com/anchore/syft#installation) installed

## Step 1: Create App Directory Structure

Create the directory structure for your new app:

```bash
# Replace 'myapp' with your app's ID (lowercase, alphanumeric + hyphens)
export APP_ID="myapp"
export APP_VERSION="1.0.0"
export PROVIDER="vendor"  # or chainguard, ironbank, etc.

# Create directory structure
mkdir -p catalog/${APP_ID}/{sboms,scans,zarf}
mkdir -p catalog/${APP_ID}/sboms/${PROVIDER}/${APP_VERSION}
mkdir -p catalog/${APP_ID}/scans/${PROVIDER}/${APP_VERSION}
```

## Step 2: Create Zarf Package

Create a `zarf.yaml` file for your application:

```bash
cat > catalog/${APP_ID}/zarf/zarf.yaml << 'EOF'
kind: ZarfPackageConfig
metadata:
  name: myapp
  description: "Description of my application"
  version: "1.0.0"
  url: "https://myapp.example.com/"
  authors:
    - "d0s-dev"

variables:
  - name: MYAPP_CONFIG
    description: "Application configuration"
    default: "default-value"

components:
  - name: myapp-server
    required: true
    description: "Deploy my application server"
    charts:
      - name: myapp
        version: "1.0.0"
        namespace: myapp
        url: https://charts.example.com/myapp
        valuesFiles:
          - "myapp-values.yaml"
    images:
      - "myapp/server:1.0.0@sha256:your-image-digest-here"
    manifests:
      - name: myapp-config
        files:
          - "manifests/configmap.yaml"
EOF
```

## Step 3: Generate SBOMs

Extract or generate SBOMs for all container images in your application:

### Option A: From Zarf Package (if you have a built package)
```bash
# If you have a pre-built Zarf package
zarf package inspect myapp-amd64-1.0.0.tar.zst --sbom-out catalog/${APP_ID}/sboms/${PROVIDER}/${APP_VERSION}/
```

### Option B: Generate directly from images
```bash
# For each image in your application
IMAGE_NAME="myapp/server:1.0.0"
IMAGE_DIGEST="sha256:your-image-digest-here"

# Generate SBOM using Syft
syft ${IMAGE_NAME}@${IMAGE_DIGEST} -o syft-json \
  > catalog/${APP_ID}/sboms/${PROVIDER}/${APP_VERSION}/myapp-server.syft.json
```

## Step 4: Run Security Scans

Generate vulnerability reports using Grype:

```bash
# Scan each image
IMAGE_NAME="myapp/server:1.0.0"
IMAGE_DIGEST="sha256:your-image-digest-here"

# Option 1: Scan image directly
grype ${IMAGE_NAME}@${IMAGE_DIGEST} -o json \
  > catalog/${APP_ID}/scans/${PROVIDER}/${APP_VERSION}/myapp-server.grype.json

# Option 2: Scan from SBOM (recommended for consistency)
grype sbom:catalog/${APP_ID}/sboms/${PROVIDER}/${APP_VERSION}/myapp-server.syft.json -o json \
  > catalog/${APP_ID}/scans/${PROVIDER}/${APP_VERSION}/myapp-server.grype.json
```

## Step 5: Create App Manifest

Create the detailed manifest for your application:

```bash
cat > catalog/${APP_ID}/manifest.json << 'EOF'
{
  "id": "myapp",
  "name": "My Application",
  "summary": "Brief description of my application (under 200 chars)",
  "description": "Detailed description of what this application does, its features, and use cases. This should be at least 50 characters and provide meaningful context for users evaluating the application.",
  "upstream": {
    "helm": {
      "name": "myapp",
      "repo": "https://charts.example.com/myapp",
      "documentation": "https://docs.example.com/myapp"
    },
    "git": "https://github.com/example/myapp",
    "website": "https://myapp.example.com/"
  },
  "labels": ["web", "api", "microservice"],
  "providers": {
    "vendor": {
      "support": "community",
      "notes": "Official upstream image",
      "versions": [
        {
          "version": "1.0.0",
          "released": "2024-01-15T00:00:00Z",
          "zarfPackage": {
            "registry": "oci://ghcr.io/d0s-dev/myapp",
            "tag": "1.0.0"
          },
          "aggregates": {
            "critical": 0,
            "high": 0,
            "medium": 1,
            "low": 2
          },
          "images": [
            {
              "name": "myapp/server:1.0.0",
              "digest": "sha256:your-image-digest-here",
              "size": "125.3 MB",
              "role": "runtime",
              "platforms": ["linux/amd64", "linux/arm64"],
              "baseImage": "alpine:3.18",
              "sbom": "./sboms/vendor/1.0.0/myapp-server.syft.json",
              "cves": "./scans/vendor/1.0.0/myapp-server.grype.json"
            }
          ]
        }
      ]
    }
  },
  "lastScanned": "2025-10-29T06:00:00Z"
}
EOF
```

## Step 6: Validate and Refresh

Validate your new manifest and update the master catalog:

```bash
# Validate the new manifest
npm run validate

# Refresh aggregates and update master catalog
npm run refresh
```

## Step 7: Add Multiple Providers (Optional)

If you have multiple provider variants (e.g., Chainguard, Iron Bank):

```bash
# Create additional provider directories
export NEW_PROVIDER="chainguard"
mkdir -p catalog/${APP_ID}/sboms/${NEW_PROVIDER}/${APP_VERSION}
mkdir -p catalog/${APP_ID}/scans/${NEW_PROVIDER}/${APP_VERSION}

# Generate SBOMs and scans for the new provider's images
IMAGE_NAME="cgr.dev/chainguard/myapp:latest"
IMAGE_DIGEST="sha256:different-digest-for-chainguard-image"

syft ${IMAGE_NAME}@${IMAGE_DIGEST} -o syft-json \
  > catalog/${APP_ID}/sboms/${NEW_PROVIDER}/${APP_VERSION}/myapp.syft.json

grype ${IMAGE_NAME}@${IMAGE_DIGEST} -o json \
  > catalog/${APP_ID}/scans/${NEW_PROVIDER}/${APP_VERSION}/myapp.grype.json

# Update manifest.json to include the new provider
# Add the new provider section to the providers object
```

## Step 8: Test Your Changes

Before submitting:

1. **Validate all files**:
   ```bash
   npm run validate
   ```

2. **Check the generated catalog**:
   ```bash
   npm run refresh
   cat catalog/apps.json | jq '.apps[] | select(.id == "myapp")'
   ```

3. **Verify file structure**:
   ```bash
   find catalog/${APP_ID} -type f | sort
   ```

## Step 9: Commit and Submit

```bash
git add catalog/${APP_ID}/
git add catalog/apps.json  # Updated by refresh command
git commit -m "feat: add ${APP_ID} v${APP_VERSION} to catalog

- Added Zarf package definition
- Generated SBOMs using Syft
- Performed security scans using Grype
- Created detailed app manifest
- Updated master catalog"

git push origin feature/add-${APP_ID}
```

## Best Practices

### Security Scanning
- Always use specific image digests (not tags) for reproducible scans
- Run scans on a regular schedule to catch new vulnerabilities
- Review scan results before adding apps with high CVE counts

### SBOM Generation
- Use consistent Syft configuration across all apps
- Include both OS packages and application dependencies
- Store SBOMs in a standard format (Syft JSON recommended)

### Manifest Quality
- Use clear, descriptive summaries and descriptions
- Include all relevant upstream links
- Choose appropriate labels for discoverability
- Test Zarf packages before adding to catalog

### Version Management
- Follow semantic versioning for app versions
- Update `latestVersion` when adding newer versions
- Maintain backward compatibility in manifest schema

## Automation

For production environments, consider automating this process:

1. **CI/CD Pipeline**: Automatically generate SBOMs and scans when new images are built
2. **Scheduled Updates**: Regularly refresh vulnerability scans for existing apps
3. **Quality Gates**: Require security review for apps with critical vulnerabilities
4. **Notification**: Alert maintainers when new CVEs affect existing apps

## Troubleshooting

### Common Issues

1. **Image not found**: Ensure you have access to pull the container image
   ```bash
   docker pull myapp/server:1.0.0
   ```

2. **Invalid manifest**: Check JSON syntax and required fields
   ```bash
   jq empty catalog/${APP_ID}/manifest.json
   ```

3. **Schema validation failed**: Review the error messages and fix missing/invalid fields
   ```bash
   npm run validate 2>&1 | grep -A5 "myapp"
   ```

4. **Missing SBOM data**: Verify Syft can analyze your image
   ```bash
   syft myapp/server:1.0.0 --quiet
   ```

### Getting Help

- Review existing app manifests for examples
- Check the JSON schemas in `schemas/` for required fields
- Consult the Zarf documentation for package configuration
- Join our community Slack for support

## Maintenance

Once your app is added:

1. **Monitor for security updates**: Set up alerts for new CVEs affecting your app
2. **Update regularly**: Add new versions as they become available
3. **Review dependencies**: Keep SBOMs current with image updates
4. **Test deployments**: Ensure Zarf packages remain functional

This process ensures consistent, high-quality application entries in the d0s catalog with comprehensive security metadata.