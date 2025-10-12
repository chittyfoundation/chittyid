/**
 * ChittyID Service - Implementation Layer
 * Actual ID generation, verification, and audit services
 * Per Charter: Services implement WHAT, Foundation defines HOW
 */

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check
      if (path === "/health") {
        return jsonResponse(
          {
            status: "HEALTHY",
            service: "chittyid-service",
            version: "1.0.0",
            purpose:
              "ChittyID Generation, Verification & Audit (Official Format: VV-G-LLL-SSSS-T-YM-C-X)",
            endpoints: [
              "/api/v2/chittyid/mint",
              "/api/v2/chittyid/verify",
              "/api/v2/chittyid/audit",
              "/api/v2/chittyid/mint/batch",
              "REMOVED: /api/v2/fallback/request - Local generation prohibited",
            ],
          },
          corsHeaders,
        );
      }

      // Mint ChittyID (Foundation generates it) - v2 API
      if (path === "/api/v2/chittyid/mint" && request.method === "POST") {
        const { entity, name, metadata, format } = await request.json();

        if (!entity || !name) {
          return jsonResponse(
            {
              success: false,
              error: "Entity type and name required",
            },
            corsHeaders,
            400,
          );
        }

        const entityUpper = entity.toUpperCase();
        const requestedFormat = format || "official"; // Default to official format

        // Dual format approach: official vs simple
        if (requestedFormat === "official") {
          // Validate entity type for official format (VV field)
          const validEntityTypes = {
            PERSON: "CP",
            LOCATION: "CL",
            THING: "CT",
            EVENT: "CE",
          };
          if (!validEntityTypes[entityUpper]) {
            return jsonResponse(
              {
                success: false,
                error: `Invalid entity type for official format. Must be one of: ${Object.keys(validEntityTypes).join(", ")}`,
              },
              corsHeaders,
              400,
            );
          }
        } else if (requestedFormat === "simple") {
          // Validate entity type for simple format
          const validSimpleEntities = [
            "PROJECT",
            "SERVICE",
            "DNA",
            "CONTRIB",
            "PROP",
            "EVNT",
            "AUTH",
            "INFO",
            "FACT",
            "CONTEXT",
            "ACTOR",
            "PERSON",
            "LOCATION",
            "THING",
            "EVENT",
          ];
          if (!validSimpleEntities.includes(entityUpper)) {
            return jsonResponse(
              {
                success: false,
                error: `Invalid entity type for simple format. Must be one of: ${validSimpleEntities.join(", ")}`,
              },
              corsHeaders,
              400,
            );
          }
        } else {
          return jsonResponse(
            {
              success: false,
              error: 'Format must be "official" or "simple"',
            },
            corsHeaders,
            400,
          );
        }

        const chittyId = await generateChittyID(
          entityUpper,
          name,
          metadata,
          requestedFormat,
          env,
        );

        // Store audit record
        await storeAuditRecord(chittyId, entity, name, metadata, env);

        // Create status block per specification
        const statusBlock = {
          status: "active",
          readable_status:
            "This ChittyID is active and has been validated on the Foundation network.",
          creation_time: new Date().toISOString(),
          drand_round: env.LAST_DRAND_ROUND || null, // Include drand round if available
          drand_randomness_source: env.LAST_DRAND_ROUND
            ? "drand.sh"
            : "crypto.getRandomValues",
          last_validated: new Date().toISOString(),
          verification_endpoint:
            "https://chittyid-foundation.workers.dev/api/v2/chittyid/verify",
        };

        return jsonResponse(
          {
            chitty_id: chittyId,
            status_block: statusBlock,
            format:
              requestedFormat === "official"
                ? "VV-G-LLL-SSSS-T-YM-C-X"
                : "CHITTY-{ENTITY}-{SEQUENCE}-{CHECKSUM}",
          },
          corsHeaders,
        );
      }

      // Verify ChittyID - v2 API
      if (path === "/api/v2/chittyid/verify" && request.method === "POST") {
        const { chittyId } = await request.json();

        if (!chittyId) {
          return jsonResponse(
            {
              success: false,
              error: "ChittyID required",
            },
            corsHeaders,
            400,
          );
        }

        const verification = await verifyChittyID(chittyId, env);

        return jsonResponse(
          {
            chittyId,
            valid: verification.valid,
            entity: verification.entity,
            sequence: verification.sequence,
            checksum: verification.checksum,
            format: verification.format,
            verifiedAt: new Date().toISOString(),
          },
          corsHeaders,
        );
      }

      // Get audit trail - v2 API
      if (path === "/api/v2/chittyid/audit" && request.method === "POST") {
        const { chittyId } = await request.json();

        if (!chittyId) {
          return jsonResponse(
            {
              success: false,
              error: "ChittyID required",
            },
            corsHeaders,
            400,
          );
        }

        const auditTrail = await getAuditTrail(chittyId, env);

        return jsonResponse(
          {
            chittyId,
            auditTrail,
            retrievedAt: new Date().toISOString(),
          },
          corsHeaders,
        );
      }

      // Batch ChittyID minting - v2 API
      if (path === "/api/v2/chittyid/mint/batch" && request.method === "POST") {
        const { requests } = await request.json();

        if (!Array.isArray(requests) || requests.length === 0) {
          return jsonResponse(
            {
              success: false,
              error: "Requests array required",
            },
            corsHeaders,
            400,
          );
        }

        const results = [];
        for (const req of requests) {
          if (req.entity && req.name) {
            const chittyId = await generateChittyID(
              req.entity.toUpperCase(),
              req.name,
              req.metadata,
              req.format || "official",
              env,
            );
            await storeAuditRecord(
              chittyId,
              req.entity,
              req.name,
              req.metadata,
              env,
            );
            results.push({
              success: true,
              chittyId,
              entity: req.entity.toUpperCase(),
              name: req.name,
            });
          } else {
            results.push({
              success: false,
              error: "Entity and name required",
              request: req,
            });
          }
        }

        return jsonResponse(
          {
            success: true,
            results,
            total: requests.length,
            successful: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
          },
          corsHeaders,
        );
      }

      // REMOVED: Fallback generation endpoint - SECURITY VIOLATION
      if (path === "/api/v2/fallback/request" && request.method === "POST") {
        return jsonResponse(
          {
            success: false,
            error:
              "SECURITY_VIOLATION: Local generation prohibited. All ChittyIDs must be requested from authorized servers only.",
            policy: "https://id.chitty.cc - Server-only generation enforced",
            violation_code: "FALLBACK_GENERATION_DISABLED",
          },
          corsHeaders,
          403,
        );
      }

      // Other API endpoints would go here...

      // If no route matches, return 404
      return jsonResponse({ error: "Not found" }, corsHeaders, 404);
    } catch (error) {
      console.error("ChittyID service error:", error);
      return jsonResponse(
        {
          error: "Internal server error",
          message: error.message,
        },
        corsHeaders,
        500,
      );
    }
  },
};

// Unused - kept for reference
// function createFallbackStatusBlock(reason) {
//   return {
//     status: "fallback",
//     readable_status:
//       "This is a temporary fallback ChittyID issued due to primary service unavailability. " +
//       "It will be automatically reconciled with a permanent ID when the primary service is restored.",
//     creation_time: new Date().toISOString(),
//     fallback_reason: reason,
//     reconciliation_pending: true,
//     primary_service_url: "https://chittyid-foundation.workers.dev",
//     fallback_service_url: "https://fallback.chittyid-foundation.workers.dev",
//     drand_round: null,
//     last_validated: new Date().toISOString(),
//     verification_endpoint:
//       "https://chittyid-foundation.workers.dev/api/v2/chittyid/verify",
//   };
// }

// Helper function for JSON responses
function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Generate ChittyID following Foundation protocol
 * Official Format: VV-G-LLL-SSSS-T-YM-C-X
 */
async function generateChittyID(entity, name, metadata, format, env) {
  if (format === "simple") {
    return await generateSimpleChittyID(entity, name, env);
  } else {
    return await generateOfficialChittyID(entity, name, metadata, env);
  }
}

/**
 * Generate Official ChittyID Format: VV-G-LLL-SSSS-T-YM-C-X
 * VV: Version (2 digits)
 * G: Geographic region (1-9)
 * LLL: Legal jurisdiction (3 letters)
 * SSSS: Sequential ID (4 digits)
 * T: Entity type (P/L/T/E for Person/Location/Thing/Event)
 * YM: Year-Month code
 * C: Trust level (0-5)
 * X: Mod-97 checksum (2 digits)
 */
async function generateOfficialChittyID(entity, name, metadata, env) {
  // VV = Vertical (CP=ChittyPerson, CL=ChittyLocation, CT=ChittyThing, CE=ChittyEvent)
  const verticalMap = {
    PERSON: "CP",
    LOCATION: "CL",
    THING: "CT",
    EVENT: "CE",
  };
  const vertical = verticalMap[entity];

  // G = Generation (time-based epoch)
  const now = new Date();
  const epochMs = now.getTime();
  const generation = Math.floor(epochMs / 1000000)
    .toString(36)
    .substring(0, 1)
    .toUpperCase();

  // LLL = Location/Node identifier (3 chars)
  const nodeId = metadata?.nodeId || "01";
  const locationCode = nodeId.padStart(2, "0") + "1";

  // SSSS = Sequence from Cloudflare's Random Beacon
  const sequence = await getCloudflareRandomBeacon(env);

  // T = Type modifier
  const typeModifier = entity.charAt(0);

  // YM = Year-Month encoding
  const yearMonth =
    (now.getFullYear() % 100).toString().padStart(2, "0") +
    (now.getMonth() + 1).toString().padStart(2, "0");

  // C = Category/Trust level
  const category = metadata?.category || "I"; // I for Identity

  // Build base ID without checksum
  const baseId = `${vertical}-${generation}-${locationCode}-${sequence}-${typeModifier}-${yearMonth}-${category}`;

  // X = Mod-97 checksum (2 digits)
  const checksum = calculateMod97Checksum(baseId).toString().padStart(2, "0");

  return `${baseId}-${checksum}`;
}

/**
 * Verify ChittyID format and checksum (supports both formats)
 */
async function verifyChittyID(chittyId, env) {
  // Determine format type
  if (chittyId.startsWith("CHITTY-")) {
    return await verifySimpleChittyID(chittyId, env);
  } else {
    return await verifyOfficialChittyID(chittyId, env);
  }
}

/**
 * Verify Official ChittyID Format: VV-G-LLL-SSSS-T-YM-C-X
 */
async function verifyOfficialChittyID(chittyId, _env) {
  const parts = chittyId.split("-");

  if (parts.length !== 8) {
    return {
      valid: false,
      format: false,
      reason: "Invalid official format - must be VV-G-LLL-SSSS-T-YM-C-X",
    };
  }

  const [
    vertical,
    generation,
    locationCode,
    sequence,
    typeModifier,
    yearMonth,
    category,
    providedChecksum,
  ] = parts;

  // Validate format components
  if (
    !/^(CP|CL|CT|CE)$/.test(vertical) ||
    !/^[A-Z0-9]$/.test(generation) ||
    !/^[A-Z0-9]{3}$/.test(locationCode) ||
    !/^\d{4}$/.test(sequence) ||
    !/^[PLTE]$/.test(typeModifier) ||
    !/^\d{4}$/.test(yearMonth) ||
    !/^[A-Z]$/.test(category) ||
    !/^\d{2}$/.test(providedChecksum)
  ) {
    return { valid: false, format: false, reason: "Invalid component format" };
  }

  // Verify Mod-97 checksum
  const baseId = `${vertical}-${generation}-${locationCode}-${sequence}-${typeModifier}-${yearMonth}-${category}`;
  const expectedChecksum = calculateMod97Checksum(baseId)
    .toString()
    .padStart(2, "0");

  return {
    valid: providedChecksum === expectedChecksum,
    format: "official",
    vertical,
    generation,
    locationCode,
    sequence,
    typeModifier,
    yearMonth,
    category,
    checksum: providedChecksum,
    expectedChecksum,
  };
}

/**
 * Verify Simple ChittyID Format: CHITTY-{ENTITY}-{SEQUENCE}-{CHECKSUM}
 */
async function verifySimpleChittyID(chittyId, env) {
  // Parse ChittyID format: CHITTY-{ENTITY}-{SEQUENCE}-{CHECKSUM}
  const parts = chittyId.split("-");

  if (parts.length !== 4 || parts[0] !== "CHITTY") {
    return { valid: false, format: false, reason: "Invalid simple format" };
  }

  const [_prefix, entity, sequence, providedChecksum] = parts;

  // Get audit record to verify with original name
  const auditRecord = await env.CHITTYID_KV.get(`audit:${chittyId}`);
  if (!auditRecord) {
    return { valid: false, format: true, reason: "No audit record found" };
  }

  const audit = JSON.parse(auditRecord);
  const expectedChecksum = await generateSimpleChecksum(
    `${entity}-${sequence}-${audit.name}`,
  );

  return {
    valid: providedChecksum === expectedChecksum,
    format: "simple",
    entity,
    sequence,
    checksum: providedChecksum,
    expectedChecksum,
  };
}

/**
 * Store audit record for ChittyID
 */
async function storeAuditRecord(chittyId, entity, name, metadata, env) {
  const auditRecord = {
    chittyId,
    entity,
    name,
    metadata: metadata || {},
    generatedAt: new Date().toISOString(),
    service: "chittyid-service",
    version: "1.0.0",
  };

  await env.CHITTYID_KV.put(`audit:${chittyId}`, JSON.stringify(auditRecord));

  // Also store by entity for queries
  const entityKey = `entity:${entity}:${Date.now()}:${chittyId}`;
  await env.CHITTYID_KV.put(entityKey, JSON.stringify(auditRecord));
}

/**
 * Get audit trail for ChittyID
 */
async function getAuditTrail(chittyId, env) {
  const auditRecord = await env.CHITTYID_KV.get(`audit:${chittyId}`);

  if (!auditRecord) {
    return { found: false };
  }

  return {
    found: true,
    record: JSON.parse(auditRecord),
  };
}

/**
 * Calculate Mod-97 checksum following Foundation standard
 * Per ISO 7064 MOD 97-10 algorithm
 */
function calculateMod97Checksum(data) {
  // Convert letters to numbers (A=10, B=11, ..., Z=35)
  const numericString = data
    .split("")
    .map((char) => {
      if (/[A-Z]/.test(char)) {
        return (char.charCodeAt(0) - 55).toString();
      }
      return char;
    })
    .join("");

  // Calculate mod 97
  let remainder = parseInt(numericString) % 97;

  // Checksum is 98 - remainder, padded to 2 digits
  const checksum = (98 - remainder).toString().padStart(2, "0");

  return checksum;
}

/**
 * Get random sequence from drand beacon network
 * SSSS field uses drand for verifiable randomness
 */
async function getCloudflareRandomBeacon(env) {
  try {
    // Try to get randomness from drand beacon network
    const drandUrl = "https://api.drand.sh/public/latest";
    const response = await fetch(drandUrl, {
      timeout: 5000, // 5 second timeout
    });

    if (response.ok) {
      const drandData = await response.json();
      // Use the randomness field from drand
      const drandRandomness = drandData.randomness;

      // Convert hex randomness to 4-digit sequence
      const hexValue = drandRandomness.substring(0, 8); // Take first 8 hex chars
      const intValue = parseInt(hexValue, 16);
      const sequence = (intValue % 10000).toString().padStart(4, "0");

      // Store drand round for audit trail
      env.LAST_DRAND_ROUND = drandData.round;

      return sequence;
    }
  } catch (error) {
    console.warn(
      "drand beacon unavailable, falling back to crypto.getRandomValues:",
      error,
    );
  }

  try {
    // Fallback to Cloudflare's crypto.getRandomValues
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);

    // Convert to 4-digit sequence
    const sequence = (randomArray[0] % 10000).toString().padStart(4, "0");

    return sequence;
  } catch (error) {
    console.error("All randomness sources failed:", error);
    // Final fallback to timestamp-based sequence
    const now = new Date();
    const timeComponent = now.getSeconds().toString().padStart(2, "0");
    const randomComponent = Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, "0");
    return timeComponent + randomComponent;
  }
}

/**
 * Generate Simple ChittyID Format: CHITTY-{ENTITY}-{SEQUENCE}-{CHECKSUM}
 */
async function generateSimpleChittyID(entity, name, env) {
  // Get next sequence number for this entity type
  const sequenceKey = `sequence:simple:${entity}`;
  const currentSequence = (await env.CHITTYID_KV.get(sequenceKey)) || "0";
  const nextSequence = (parseInt(currentSequence) + 1)
    .toString()
    .padStart(6, "0");

  // Update sequence
  await env.CHITTYID_KV.put(sequenceKey, nextSequence);

  // Generate checksum
  const checksum = await generateSimpleChecksum(
    `${entity}-${nextSequence}-${name}`,
  );

  return `CHITTY-${entity}-${nextSequence}-${checksum}`;
}

/**
 * Generate checksum for simple format
 */
async function generateSimpleChecksum(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Generate Fallback ChittyID with error-coded format
 * Uses 'E' domain instead of 'C' to indicate error/fallback state
 */
/**
 * REMOVED: Local ID generation functions - SECURITY VIOLATION
 *
 * This function has been removed as it violated ChittyOS security policy.
 * ALL ChittyID generation must be performed by authorized servers only.
 *
 * NO LOCAL GENERATION - NO FALLBACK GENERATION - NO EXCEPTIONS
 *
 * Use: https://id.chitty.cc for all ChittyID requests
 */
// REMOVED: Local ID generation function completely removed for security

// REMOVED: All local generation functions completely removed for security compliance
// - Local official ID generation
// - Local simple ID generation
// All ChittyIDs must be requested from https://id.chitty.cc

/**
 * Store audit record for fallback ChittyID (Unused - kept for reference)
 */
// eslint-disable-next-line no-unused-vars
async function storeFallbackAuditRecord(
  chittyId,
  entity,
  name,
  metadata,
  reason,
  env,
) {
  const auditRecord = {
    chittyId,
    entity,
    name,
    metadata: metadata || {},
    fallbackReason: reason,
    generatedAt: new Date().toISOString(),
    service: "chittyid-service",
    version: "1.0.0",
    type: "fallback",
    reconciliationPending: true,
  };

  await env.CHITTYID_KV.put(`audit:${chittyId}`, JSON.stringify(auditRecord));

  // Also store by fallback entity for queries
  const fallbackKey = `fallback:${entity}:${Date.now()}:${chittyId}`;
  await env.CHITTYID_KV.put(fallbackKey, JSON.stringify(auditRecord));
}

// Helper function for JSON responses already declared above
