#!/usr/bin/env node
/**
 * Catalog Management Script
 * 
 * This script manages the d0s app catalog by:
 * 1. Validating manifest files against JSON schema
 * 2. Aggregating data from individual manifests into apps.json
 * 3. Refreshing CVE scan data and timestamps
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const CATALOG_DIR = path.join(__dirname, 'catalog');
const SCHEMAS_DIR = path.join(__dirname, 'schemas');

// Initialize JSON schema validator
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Load schemas
const manifestSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'manifest.schema.json'), 'utf8'));
const catalogSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'catalog.schema.json'), 'utf8'));

const validateManifest = ajv.compile(manifestSchema);
const validateCatalog = ajv.compile(catalogSchema);

/**
 * Parse Grype JSON output to count vulnerabilities by severity
 */
function parseGrypeScan(scanPath) {
  try {
    if (!fs.existsSync(scanPath)) {
      console.warn(`Scan file not found: ${scanPath}`);
      return { critical: 0, high: 0, medium: 0, low: 0 };
    }

    const scanData = JSON.parse(fs.readFileSync(scanPath, 'utf8'));
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };

    // Support both formats: grype CLI output (vulnerabilities) and d0s output (matches)
    const vulns = scanData.matches || scanData.vulnerabilities || [];
    
    vulns.forEach(vuln => {
      const severity = vuln.vulnerability?.severity?.toLowerCase() || 'unknown';
      if (counts.hasOwnProperty(severity)) {
        counts[severity]++;
      }
    });

    return counts;
  } catch (error) {
    console.error(`Error parsing scan file ${scanPath}:`, error.message);
    return { critical: 0, high: 0, medium: 0, low: 0 };
  }
}

/**
 * Aggregate CVE counts across all images in a version
 */
function aggregateCVEs(images, basePath) {
  const total = { critical: 0, high: 0, medium: 0, low: 0 };

  images.forEach(image => {
    if (image.cves) {
      // Handle both string (single arch) and object (multi-arch) formats
      const cvePaths = typeof image.cves === 'string' 
        ? [image.cves] 
        : Object.values(image.cves);
      
      cvePaths.forEach(cvePath => {
        const scanPath = path.join(basePath, cvePath);
        const imageCVEs = parseGrypeScan(scanPath);
        
        total.critical += imageCVEs.critical;
        total.high += imageCVEs.high;
        total.medium += imageCVEs.medium;
        total.low += imageCVEs.low;
      });
    }
  });

  return total;
}

/**
 * Update aggregates in a manifest based on actual scan data
 */
function refreshManifestAggregates(manifestPath) {
  console.log(`Refreshing aggregates for ${manifestPath}`);
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const basePath = path.dirname(manifestPath);
  let updated = false;

  // Update timestamp
  manifest.lastScanned = new Date().toISOString();
  updated = true;

  // Refresh aggregates for each provider/version
  Object.keys(manifest.providers).forEach(providerName => {
    const provider = manifest.providers[providerName];
    
    provider.versions.forEach(version => {
      if (version.images && version.images.length > 0) {
        const newAggregates = aggregateCVEs(version.images, basePath);
        
        // Only update if aggregates changed
        if (!version.aggregates || 
            JSON.stringify(version.aggregates) !== JSON.stringify(newAggregates)) {
          version.aggregates = newAggregates;
          updated = true;
          console.log(`  Updated ${providerName} v${version.version}:`, newAggregates);
        }
      }
    });
  });

  if (updated) {
    // Validate updated manifest
    if (!validateManifest(manifest)) {
      console.error('Manifest validation failed:', validateManifest.errors);
      process.exit(1);
    }

    // Write back to file with pretty formatting
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`  ✓ Updated ${manifestPath}`);
  }

  return manifest;
}

/**
 * Generate the master catalog from all manifests
 */
function generateCatalog() {
  console.log('Generating master catalog...');
  
  const apps = [];
  const appDirs = fs.readdirSync(CATALOG_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  appDirs.forEach(appId => {
    const manifestPath = path.join(CATALOG_DIR, appId, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      console.warn(`No manifest found for app: ${appId}`);
      return;
    }

    const manifest = refreshManifestAggregates(manifestPath);
    
    // Calculate aggregate data for catalog entry
    const providers = Object.keys(manifest.providers);
    const totalCVEs = { critical: 0, high: 0, medium: 0, low: 0 };
    let totalImages = 0;
    let latestVersion = '0.0.0';

    providers.forEach(providerName => {
      const provider = manifest.providers[providerName];
      provider.versions.forEach(version => {
        // Sum up CVEs
        if (version.aggregates) {
          totalCVEs.critical += version.aggregates.critical;
          totalCVEs.high += version.aggregates.high;
          totalCVEs.medium += version.aggregates.medium;
          totalCVEs.low += version.aggregates.low;
        }
        
        // Count images
        totalImages += version.images ? version.images.length : 0;
        
        // Find latest version (simple string comparison for now)
        if (version.version > latestVersion) {
          latestVersion = version.version;
        }
      });
    });

    const catalogEntry = {
      id: manifest.id,
      name: manifest.name,
      summary: manifest.summary,
      labels: manifest.labels,
      providers: providers,
      hasIronBank: providers.includes('ironbank'),
      hasChainguard: providers.includes('chainguard'),
      imageCount: totalImages,
      cves: totalCVEs,
      latestVersion: latestVersion,
      zarfPackage: `catalog/${appId}/zarf/zarf.yaml`,
      links: {
        helm: manifest.upstream.helm?.repo,
        documentation: manifest.upstream.helm?.documentation,
        git: manifest.upstream.git,
        website: manifest.upstream.website
      }
    };

    apps.push(catalogEntry);
  });

  // Sort apps alphabetically by name
  apps.sort((a, b) => a.name.localeCompare(b.name));

  const catalog = {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    apps: apps
  };

  // Validate catalog
  if (!validateCatalog(catalog)) {
    console.error('Catalog validation failed:', validateCatalog.errors);
    process.exit(1);
  }

  // Write catalog
  const catalogPath = path.join(CATALOG_DIR, 'apps.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  
  console.log(`✓ Generated catalog with ${apps.length} apps`);
  console.log(`✓ Written to ${catalogPath}`);
}

/**
 * Validate all manifest files
 */
function validateAllManifests() {
  console.log('Validating all manifests...');
  
  const appDirs = fs.readdirSync(CATALOG_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  let errors = 0;

  appDirs.forEach(appId => {
    const manifestPath = path.join(CATALOG_DIR, appId, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      console.warn(`No manifest found for app: ${appId}`);
      return;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      if (!validateManifest(manifest)) {
        console.error(`❌ Validation failed for ${appId}:`);
        validateManifest.errors.forEach(error => {
          console.error(`  ${error.instancePath}: ${error.message}`);
        });
        errors++;
      } else {
        console.log(`✓ ${appId} manifest is valid`);
      }
    } catch (error) {
      console.error(`❌ Error reading ${appId} manifest:`, error.message);
      errors++;
    }
  });

  if (errors > 0) {
    console.error(`\n${errors} validation errors found`);
    process.exit(1);
  } else {
    console.log('\n✓ All manifests are valid');
  }
}

// CLI interface
const command = process.argv[2];

switch (command) {
  case 'validate':
    validateAllManifests();
    break;
  case 'refresh':
    generateCatalog();
    break;
  case 'help':
  default:
    console.log('D0S Catalog Management\n');
    console.log('Usage: node catalog.js <command>\n');
    console.log('Commands:');
    console.log('  validate    Validate all manifest files');
    console.log('  refresh     Refresh aggregates and generate catalog');
    console.log('  help        Show this help message');
    break;
}