#!/usr/bin/env node

/**
 * ChittyContext CLI - Environment & Context Management Tool
 *
 * Usage:
 *   node scripts/chittycontext.js validate [env]
 *   node scripts/chittycontext.js check-secrets [env]
 *   node scripts/chittycontext.js export-env [env]
 */

import {
  chittyContext,
  getEnvironmentContext,
  validateEnvironment,
} from "../chittycontext.config.js";
import { readFileSync, existsSync } from "fs";

const command = process.argv[2];
const env = process.argv[3] || "development";

function printHeader(title) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60) + "\n");
}

function validateCommand() {
  printHeader(`ChittyContext Validation - ${env.toUpperCase()}`);

  const context = getEnvironmentContext(env);
  const errors = [];
  const warnings = [];

  // 1. Validate required files exist
  console.log("📁 Checking required files...");
  chittyContext.validation.requiredFiles.forEach((file) => {
    if (existsSync(file)) {
      console.log(`  ✅ ${file}`);
    } else {
      errors.push(`Missing required file: ${file}`);
      console.log(`  ❌ ${file} (MISSING)`);
    }
  });

  // 2. Check for blocked patterns
  console.log("\n🔍 Scanning for blocked patterns...");
  const sourceFiles = [
    "functions/api/[[route]].js",
    "src/pipeline/index.js",
    "src/services/vrf-generator.js",
  ];

  sourceFiles.forEach((file) => {
    if (!existsSync(file)) {
      warnings.push(`Cannot scan ${file} - file not found`);
      return;
    }

    const content = readFileSync(file, "utf8");

    // Remove comments and strings before scanning
    const codeOnly = content
      // Remove block comments
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Remove line comments
      .replace(/\/\/.*/g, "")
      // Remove template literals
      .replace(/`[^`]*`/g, "")
      // Remove double-quoted strings
      .replace(/"(?:[^"\\]|\\.)*"/g, "")
      // Remove single-quoted strings
      .replace(/'(?:[^'\\]|\\.)*'/g, "");

    chittyContext.validation.blockedPatterns.forEach((pattern) => {
      if (codeOnly.includes(pattern)) {
        errors.push(`Found blocked pattern "${pattern}" in ${file}`);
        console.log(`  ❌ ${file}: Found "${pattern}" in actual code`);
      }
    });
  });

  if (
    sourceFiles.every(
      (f) => existsSync(f) && !errors.some((e) => e.includes(f)),
    )
  ) {
    console.log("  ✅ No blocked patterns found");
  }

  // 3. Validate environment configuration
  console.log("\n⚙️  Environment Configuration:");
  console.log(`  Environment: ${context.name}`);
  console.log(`  Domain: ${context.domain}`);
  console.log(`  Worker: ${context.workerName}`);

  // 4. Check KV namespaces
  console.log("\n📦 KV Namespaces:");
  Object.entries(context.kvNamespaces).forEach(([binding, id]) => {
    console.log(`  ✅ ${binding}: ${id}`);
  });

  // 5. Check secrets configuration
  console.log("\n🔐 Secrets Configuration:");
  console.log("  Required:");
  context.requiresSecrets.forEach((secret) => {
    console.log(`    - ${secret}`);
  });
  console.log("  Optional:");
  context.optionalSecrets.forEach((secret) => {
    console.log(`    - ${secret}`);
  });

  // 6. Check features
  console.log("\n✨ Features:");
  Object.entries(context.features).forEach(([feature, enabled]) => {
    const icon = enabled ? "✅" : "❌";
    console.log(`  ${icon} ${feature}`);
  });

  // 7. Check service dependencies
  console.log("\n🔗 Service Dependencies:");
  Object.entries(chittyContext.services).forEach(([key, service]) => {
    const icon = service.required ? "🔴" : "🟡";
    console.log(`  ${icon} ${service.name}: ${service.url}`);
  });

  // Summary
  console.log("\n" + "=".repeat(60));
  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ VALIDATION PASSED - No issues found");
  } else {
    if (errors.length > 0) {
      console.log(`❌ VALIDATION FAILED - ${errors.length} error(s) found:`);
      errors.forEach((error) => console.log(`   - ${error}`));
    }
    if (warnings.length > 0) {
      console.log(`⚠️  ${warnings.length} warning(s):`);
      warnings.forEach((warning) => console.log(`   - ${warning}`));
    }
  }
  console.log("=".repeat(60) + "\n");

  process.exit(errors.length > 0 ? 1 : 0);
}

function checkSecretsCommand() {
  printHeader(`ChittyContext Secrets Check - ${env.toUpperCase()}`);

  const context = getEnvironmentContext(env);

  console.log("🔐 Required Secrets:");
  context.requiresSecrets.forEach((secret) => {
    const isSet = process.env[secret] !== undefined;
    const icon = isSet ? "✅" : "❌";
    console.log(`  ${icon} ${secret}`);
  });

  console.log("\n🔐 Optional Secrets:");
  context.optionalSecrets.forEach((secret) => {
    const isSet = process.env[secret] !== undefined;
    const icon = isSet ? "✅" : "⚪";
    console.log(`  ${icon} ${secret}`);
  });

  const allRequiredSet = context.requiresSecrets.every(
    (secret) => process.env[secret] !== undefined,
  );

  console.log("\n" + "=".repeat(60));
  if (allRequiredSet) {
    console.log("✅ All required secrets are set");
  } else {
    console.log("❌ Some required secrets are missing");
  }
  console.log("=".repeat(60) + "\n");

  process.exit(allRequiredSet ? 0 : 1);
}

function exportEnvCommand() {
  const context = getEnvironmentContext(env);

  // Export environment variables in GitHub Actions format
  console.log(`ENVIRONMENT=${context.name}`);
  console.log(`WORKER_NAME=${context.workerName}`);
  console.log(`DEPLOYMENT_URL=${context.url}`);
  console.log(`CLOUDFLARE_ACCOUNT_ID=${chittyContext.cloudflare.accountId}`);
  console.log(`DRAND_BEACON_URL=${chittyContext.services.drand.url}`);

  // Export KV namespace IDs
  Object.entries(context.kvNamespaces).forEach(([binding, id]) => {
    console.log(`KV_${binding}=${id}`);
  });
}

function showUsage() {
  console.log(`
ChittyContext CLI - Environment & Context Management

Usage:
  node scripts/chittycontext.js <command> [environment]

Commands:
  validate [env]       Validate environment configuration and codebase
  check-secrets [env]  Check if required secrets are set
  export-env [env]     Export environment variables for CI/CD

Environments:
  development (default)
  staging
  production

Examples:
  node scripts/chittycontext.js validate production
  node scripts/chittycontext.js check-secrets staging
  node scripts/chittycontext.js export-env production

Environment Variables (CI/CD):
  All required secrets must be set as environment variables or GitHub Secrets.
  `);
}

// Main execution
try {
  switch (command) {
    case "validate":
      validateCommand();
      break;
    case "check-secrets":
      checkSecretsCommand();
      break;
    case "export-env":
      exportEnvCommand();
      break;
    case "help":
    case "--help":
    case "-h":
      showUsage();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      showUsage();
      process.exit(1);
  }
} catch (error) {
  console.error(`\n❌ Error: ${error.message}\n`);
  process.exit(1);
}
