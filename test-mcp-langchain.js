#!/usr/bin/env node

/**
 * Test Script for ChittyMCP LangChain Integration
 * Tests the new AI capabilities in the MCP server
 */

import { ChittyIDMCPHandler } from "./mcp-handler.js";

async function testLangChainIntegration() {
  console.log("🧪 Testing ChittyMCP LangChain Integration\n");

  try {
    // Initialize MCP handler
    const handler = new ChittyIDMCPHandler();
    console.log("✅ MCP Handler initialized successfully");

    // Test health check including AI services
    console.log("\n🔍 Testing health check...");
    const health = await handler.healthCheck();
    console.log("Health Status:", JSON.stringify(health, null, 2));

    // Test AI legal analysis
    console.log("\n⚖️ Testing AI legal analysis...");
    const legalAnalysis = await handler.handleAIOperation("ai_legal_analysis", {
      caseDetails:
        "Contract dispute involving breach of service agreement and damages claim",
      analysisType: "summary",
      provider: "anthropic",
    });
    console.log(
      "Legal Analysis Result:",
      JSON.stringify(legalAnalysis, null, 2),
    );

    // Test AI health check
    console.log("\n🩺 Testing AI health check...");
    const aiHealth = await handler.handleAIOperation("ai_health_check", {});
    console.log("AI Health Check:", JSON.stringify(aiHealth, null, 2));

    console.log("\n✅ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

// Run tests if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testLangChainIntegration().catch(console.error);
}

export { testLangChainIntegration };
