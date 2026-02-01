# Zarf YAML Template Specification

This document describes the Go template format for `zarf.yaml.tmpl` files in the d0s catalog.

## Template Data

When rendering a `zarf.yaml.tmpl`, the following data is injected:

```go
type TemplateData struct {
    // From manifest.json
    ID          string   // App identifier (e.g., "redis")
    Name        string   // Display name (e.g., "Redis")
    Description string   // App description
    Version     string   // Target app version (e.g., "7.2.4")
    ChartVersion string  // Helm chart version (e.g., "18.6.1")
    
    // From manifest.json upstream
    ChartRepo   string   // Helm repo URL
    ChartName   string   // Chart name in repo
    
    // Extracted/resolved images for this version
    Images      []string // Full image refs with digests
    
    // Build context
    Arch        string   // Target architecture (amd64, arm64)
}
```

## Template Functions

Standard Go template functions plus:

- `indent N` - Indent text by N spaces
- `toYaml` - Convert value to YAML string
- `default VALUE` - Default value if empty

## Example Template

```yaml
kind: ZarfPackageConfig
metadata:
  name: {{ .ID }}
  description: "{{ .Description }}"
  version: "{{ .Version }}"
  architecture: {{ .Arch }}

components:
  - name: {{ .ID }}
    required: true
    description: "Deploy {{ .Name }}"
    charts:
      - name: {{ .ChartName }}
        version: "{{ .ChartVersion }}"
        namespace: {{ .ID }}
        url: {{ .ChartRepo }}
        valuesFiles:
          - ../values.yaml
    images:
{{- range .Images }}
      - "{{ . }}"
{{- end }}
```

## Manual Image Additions

For charts with images that helm-images cannot detect (e.g., Crossplane providers,
operator-managed images), add them directly in the template:

```yaml
    images:
{{- range .Images }}
      - "{{ . }}"
{{- end }}
      # Manual additions for operator-managed images
      - "xpkg.upbound.io/crossplane-contrib/provider-aws:v0.47.0"
```

## Values File Reference

The template references `../values.yaml` which is the shared values file at the app root.
This file should contain version-agnostic Helm values.

## Generated Output

Running `d0s package generate --version X.Y.Z` produces:

```
{app}/versions/X.Y.Z/zarf.yaml
```

This file is committed to git for auditability and manual debugging.
Users can run `zarf package create {app}/versions/X.Y.Z/` to build manually.
