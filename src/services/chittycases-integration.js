/**
 * ChittyCases Integration Service for ChittyOS MCP Portal
 * Provides legal case research and strategic insights
 */

export class ChittyCasesService {
  constructor(config = {}) {
    this.openaiKey = config.OPENAI_API_KEY;
    this.anthropicKey = config.ANTHROPIC_API_KEY;
    this.chittyServerUrl = config.CHITTY_SERVER_URL || "https://id.chitty.cc";
    this.chittyApiKey = config.CHITTY_API_KEY;
    this.chittyCasesToken = config.CHITTYCASES_TOKEN;
    this.chittyCasesUrl = config.CHITTYCASES_URL || "https://cases.chitty.cc";
  }

  /**
   * Perform legal research using ChittyCases database
   */
  async performLegalResearch({
    query,
    jurisdiction = "Cook County, Illinois",
    caseNumber,
  }) {
    try {
      // Search ChittyCases database
      const searchResults = await this.searchCases(
        query,
        jurisdiction,
        caseNumber,
      );

      // Enhance results with AI analysis
      const enhancedResults = await this.enhanceWithAI(searchResults, query);

      return {
        results: enhancedResults,
        sources: searchResults.sources,
        query,
        jurisdiction,
        searchedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[ChittyCases] Legal research failed:", error);
      throw error;
    }
  }

  /**
   * Get strategic case insights
   */
  async getCaseInsights({ caseNumber, insightType = "strategic" }) {
    try {
      // Get case details from ChittyCases
      const caseDetails = await this.getCaseDetails(caseNumber);

      // Generate insights using AI
      const insights = await this.generateInsights(caseDetails, insightType);

      // Get recommendations
      const recommendations = await this.generateRecommendations(
        caseDetails,
        insightType,
      );

      return {
        insights,
        recommendations,
        caseNumber,
        insightType,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[ChittyCases] Case insights failed:", error);
      throw error;
    }
  }

  /**
   * Search cases in ChittyCases database
   */
  async searchCases(query, jurisdiction, caseNumber) {
    try {
      const searchEndpoint = `${this.chittyCasesUrl}/api/search`;

      const response = await fetch(searchEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.chittyCasesToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          jurisdiction,
          case_number: caseNumber,
          include_metadata: true,
          max_results: 50,
        }),
      });

      if (!response.ok) {
        // Fallback to simulated results if service unavailable
        return this.generateFallbackResults(query, jurisdiction);
      }

      const results = await response.json();
      return {
        cases: results.cases || [],
        sources: results.sources || [],
        total: results.total || 0,
      };
    } catch (error) {
      console.error("[ChittyCases] Search failed, using fallback:", error);
      return this.generateFallbackResults(query, jurisdiction);
    }
  }

  /**
   * Get detailed case information
   */
  async getCaseDetails(caseNumber) {
    try {
      const caseEndpoint = `${this.chittyCasesUrl}/api/cases/${caseNumber}`;

      const response = await fetch(caseEndpoint, {
        headers: {
          Authorization: `Bearer ${this.chittyCasesToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return this.generateFallbackCaseDetails(caseNumber);
      }

      return await response.json();
    } catch (error) {
      console.error(
        "[ChittyCases] Case details failed, using fallback:",
        error,
      );
      return this.generateFallbackCaseDetails(caseNumber);
    }
  }

  /**
   * Enhance search results with AI analysis
   */
  async enhanceWithAI(searchResults, query) {
    try {
      const prompt = `Analyze these legal case search results for the query "${query}":

${JSON.stringify(searchResults.cases, null, 2)}

Provide:
1. Key patterns and trends
2. Most relevant cases
3. Legal precedents
4. Strategic implications`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.anthropicKey}`,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        return searchResults.cases;
      }

      const aiResult = await response.json();
      const analysis = aiResult.content[0].text;

      return searchResults.cases.map((case_) => ({
        ...case_,
        ai_analysis: analysis,
        enhanced: true,
      }));
    } catch (error) {
      console.error("[ChittyCases] AI enhancement failed:", error);
      return searchResults.cases;
    }
  }

  /**
   * Generate strategic insights for a case
   */
  async generateInsights(caseDetails, insightType) {
    const prompts = {
      strategic:
        "Provide strategic insights for this legal case, focusing on overall approach and positioning.",
      tactical:
        "Provide tactical insights for this legal case, focusing on specific actions and maneuvers.",
      procedural:
        "Provide procedural insights for this legal case, focusing on court procedures and deadlines.",
      financial:
        "Provide financial insights for this legal case, focusing on costs, damages, and economic factors.",
    };

    const prompt = `${prompts[insightType] || prompts.strategic}

Case Details:
${JSON.stringify(caseDetails, null, 2)}

Provide detailed insights in the requested category.`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.anthropicKey}`,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI insights failed: ${response.status}`);
      }

      const result = await response.json();
      return result.content[0].text;
    } catch (error) {
      console.error("[ChittyCases] Insights generation failed:", error);
      return `Unable to generate ${insightType} insights at this time.`;
    }
  }

  /**
   * Generate recommendations based on case details
   */
  async generateRecommendations(caseDetails, insightType) {
    const prompt = `Based on this legal case, provide specific actionable recommendations:

Case Details:
${JSON.stringify(caseDetails, null, 2)}

Focus Area: ${insightType}

Provide 3-5 specific, actionable recommendations.`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.anthropicKey}`,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI recommendations failed: ${response.status}`);
      }

      const result = await response.json();
      return result.content[0].text;
    } catch (error) {
      console.error("[ChittyCases] Recommendations generation failed:", error);
      return "Unable to generate recommendations at this time.";
    }
  }

  /**
   * Generate fallback search results when service unavailable
   */
  generateFallbackResults(query, jurisdiction) {
    return {
      cases: [
        {
          case_number: "DEMO-2024-001",
          title: `Demo Case Related to: ${query}`,
          jurisdiction: jurisdiction,
          status: "Active",
          date_filed: new Date().toISOString().split("T")[0],
          summary: `This is a demonstration case related to the query: ${query}. In a live environment, this would show actual case data from the ChittyCases database.`,
          is_demo: true,
        },
      ],
      sources: ["ChittyCases Demo Database"],
      total: 1,
    };
  }

  /**
   * Generate fallback case details when service unavailable
   */
  generateFallbackCaseDetails(caseNumber) {
    return {
      case_number: caseNumber,
      title: `Demo Case ${caseNumber}`,
      status: "Active",
      parties: {
        plaintiff: "Demo Plaintiff",
        defendant: "Demo Defendant",
      },
      filing_date: new Date().toISOString().split("T")[0],
      jurisdiction: "Cook County, Illinois",
      case_type: "Civil",
      summary: `This is demonstration data for case ${caseNumber}. In a live environment, this would show actual case details from the ChittyCases database.`,
      documents: [],
      events: [],
      is_demo: true,
    };
  }
}
