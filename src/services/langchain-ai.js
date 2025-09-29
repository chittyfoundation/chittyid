/**
 * LangChain AI Service for ChittyOS MCP Portal
 * Provides legal analysis and document generation capabilities
 */

export class LangChainAIService {
  constructor(config = {}) {
    this.openaiKey = config.OPENAI_API_KEY;
    this.anthropicKey = config.ANTHROPIC_API_KEY;
    this.chittyServerUrl = config.CHITTY_SERVER_URL || "https://id.chitty.cc";
    this.chittyApiKey = config.CHITTY_API_KEY;
  }

  /**
   * Analyze legal case using AI
   */
  async analyzeLegalCase({
    caseDetails,
    analysisType,
    provider = "anthropic",
  }) {
    try {
      const aiEndpoint =
        provider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://api.anthropic.com/v1/messages";

      const prompt = this.buildAnalysisPrompt(caseDetails, analysisType);

      const response = await fetch(aiEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider === "openai" ? this.openaiKey : this.anthropicKey}`,
          "Content-Type": "application/json",
          ...(provider === "anthropic" && {
            "anthropic-version": "2023-06-01",
          }),
        },
        body: JSON.stringify(this.buildAIRequest(prompt, provider)),
      });

      if (!response.ok) {
        throw new Error(`AI analysis failed: ${response.status}`);
      }

      const result = await response.json();
      const analysis = this.extractAnalysis(result, provider);

      return {
        analysis,
        confidence: 0.85,
        provider,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[LangChain] Analysis failed:", error);
      throw error;
    }
  }

  /**
   * Generate legal document using AI
   */
  async generateDocument({ documentType, caseData, template, requirements }) {
    try {
      const prompt = this.buildDocumentPrompt(
        documentType,
        caseData,
        template,
        requirements,
      );

      // Use Anthropic for document generation (better for legal documents)
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.anthropicKey}`,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Document generation failed: ${response.status}`);
      }

      const result = await response.json();
      const document = result.content[0].text;

      // Generate ChittyID for the document
      const documentId = await this.generateDocumentId(documentType);

      return {
        document,
        documentId,
        documentType,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[LangChain] Document generation failed:", error);
      throw error;
    }
  }

  /**
   * Build analysis prompt based on type
   */
  buildAnalysisPrompt(caseDetails, analysisType) {
    const prompts = {
      risk: `Analyze the legal risks in this case: ${caseDetails}. Provide a comprehensive risk assessment with likelihood and impact ratings.`,
      strategy: `Develop a legal strategy for this case: ${caseDetails}. Include recommended actions, timeline, and success factors.`,
      summary: `Provide a clear, concise summary of this legal case: ${caseDetails}. Include key facts, legal issues, and current status.`,
      precedent: `Identify relevant legal precedents for this case: ${caseDetails}. Focus on similar cases and their outcomes.`,
    };

    return prompts[analysisType] || prompts.summary;
  }

  /**
   * Build document generation prompt
   */
  buildDocumentPrompt(documentType, caseData, template, requirements) {
    const jurisdiction = template?.jurisdiction || "Cook County, Illinois";
    const format = requirements?.format || "legal_standard";

    return `Generate a ${documentType} document for the following case data: ${JSON.stringify(caseData)}.
    Jurisdiction: ${jurisdiction}
    Format: ${format}

    Ensure the document follows proper legal formatting and includes all required sections for a ${documentType} in ${jurisdiction}.`;
  }

  /**
   * Build AI request payload
   */
  buildAIRequest(prompt, provider) {
    if (provider === "openai") {
      return {
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
      };
    } else {
      return {
        model: "claude-3-sonnet-20240229",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      };
    }
  }

  /**
   * Extract analysis from AI response
   */
  extractAnalysis(result, provider) {
    if (provider === "openai") {
      return result.choices[0].message.content;
    } else {
      return result.content[0].text;
    }
  }

  /**
   * Generate ChittyID for document
   */
  async generateDocumentId(documentType) {
    try {
      const response = await fetch(`${this.chittyServerUrl}/v1/mint`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.chittyApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entityType: "INFO",
          metadata: {
            document_type: documentType,
            source: "langchain_ai",
            generator: "mcp_portal",
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`ChittyID generation failed: ${response.status}`);
      }

      const result = await response.json();
      return result.chitty_id;
    } catch (error) {
      console.error("[LangChain] ChittyID generation failed:", error);
      return `DOC-${Date.now()}-${documentType.toUpperCase()}`;
    }
  }
}
