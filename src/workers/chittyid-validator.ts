import { Ai } from "@cloudflare/ai";

interface Env {
  AI: Ai;
  CHITTY_IDS: KVNamespace;
  CHITTY_VECTORS: VectorizeIndex;
  AI_GATEWAY?: string;
}

interface ChittyID {
  version: string;
  region: string;
  jurisdiction: string;
  sequentialId: string;
  entityType: "ChittyPerson" | "ChittyLocation" | "ChittyThing" | "ChittyEvent" | "ChittyAuthority";
  yearMonth: string;
  trustLevel: string;
  checksum: string;
}

export class ChittyIDValidator {
  private ai: Ai;
  private kv: KVNamespace;
  private vectorize: VectorizeIndex;

  constructor(env: Env) {
    this.ai = env.AI;
    this.kv = env.CHITTY_IDS;
    this.vectorize = env.CHITTY_VECTORS;
  }

  parseChittyID(chittyId: string): ChittyID | null {
    // Format: VV-G-LLL-SSSS-T-YM-C-X
    // @canon: chittycanon://gov/governance#core-types
    const pattern =
      /^(\d{2})-([A-Z])-([A-Z]{3})-(\d{4})-([PLTEA])-(\d{4})-([L]\d)-(\d{2})$/;
    const match = chittyId.match(pattern);

    if (!match) return null;

    const entityTypeMap: Record<string, ChittyID["entityType"]> = {
      P: "ChittyPerson",
      L: "ChittyLocation",
      T: "ChittyThing",
      E: "ChittyEvent",
      A: "ChittyAuthority",
    };

    return {
      version: match[1],
      region: match[2],
      jurisdiction: match[3],
      sequentialId: match[4],
      entityType: entityTypeMap[match[5]],
      yearMonth: match[6],
      trustLevel: match[7],
      checksum: match[8],
    };
  }

  validateChecksum(chittyId: string): boolean {
    const parts = chittyId.split("-");
    if (parts.length !== 8) return false;

    const checksum = parts[7];
    const dataToCheck = parts.slice(0, 7).join("");

    // Mod-97 checksum validation
    const calculated = this.calculateMod97(dataToCheck);
    return calculated === checksum;
  }

  private calculateMod97(data: string): string {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      sum = (sum * 10 + (char % 10)) % 97;
    }
    return String(97 - sum).padStart(2, "0");
  }

  async validateWithAI(
    chittyId: string,
    context?: string,
  ): Promise<{
    valid: boolean;
    confidence: number;
    issues?: string[];
    suggestions?: string[];
  }> {
    const parsed = this.parseChittyID(chittyId);
    if (!parsed) {
      return {
        valid: false,
        confidence: 1.0,
        issues: ["Invalid ChittyID format"],
      };
    }

    const checksumValid = this.validateChecksum(chittyId);
    if (!checksumValid) {
      return {
        valid: false,
        confidence: 1.0,
        issues: ["Invalid checksum"],
      };
    }

    // Use AI for contextual validation
    const prompt = `Validate this ChittyID and its context:
    ChittyID: ${chittyId}
    Parsed Data: ${JSON.stringify(parsed, null, 2)}
    Context: ${context || "No additional context provided"}

    Analyze for:
    1. Logical consistency (e.g., trust level appropriate for entity type)
    2. Temporal validity (year-month reasonable)
    3. Geographic validity (region and jurisdiction consistency)

    Return a JSON object with: valid (boolean), confidence (0-1), issues (array), suggestions (array)`;

    try {
      const response = await this.ai.run("@cf/meta/llama-3-8b-instruct", {
        prompt,
        max_tokens: 500,
        temperature: 0.3,
      });

      // Handle different response formats from Cloudflare AI
      const responseText =
        typeof response === "string"
          ? response
          : (response as any).response || JSON.stringify(response);
      return JSON.parse(responseText);
    } catch (error) {
      // Fallback to basic validation
      return {
        valid: true,
        confidence: 0.8,
        suggestions: ["AI validation unavailable, basic checks passed"],
      };
    }
  }

  async storeChittyID(
    chittyId: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    const parsed = this.parseChittyID(chittyId);
    if (!parsed) throw new Error("Invalid ChittyID");

    // Store in KV
    await this.kv.put(
      chittyId,
      JSON.stringify({
        ...parsed,
        metadata,
        createdAt: new Date().toISOString(),
      }),
    );

    // Generate embedding for semantic search
    const embedding = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
      text: `${chittyId} ${parsed.entityType} ${JSON.stringify(metadata)}`,
    });

    // Store in Vectorize
    await this.vectorize.upsert([
      {
        id: chittyId,
        values: embedding.data[0],
        metadata: {
          entityType: parsed.entityType,
          trustLevel: parsed.trustLevel,
          ...metadata,
        },
      },
    ]);
  }

  async searchSimilar(query: string, topK: number = 5): Promise<any[]> {
    // Generate query embedding
    const embedding = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
      text: query,
    });

    // Search in Vectorize
    const results = await this.vectorize.query(embedding.data[0], {
      topK,
      returnValues: true,
      returnMetadata: "all",
    });

    return results.matches;
  }
}
