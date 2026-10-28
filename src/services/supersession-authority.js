/**
 * ChittyID supersession authority projection.
 *
 * ChittyMint signs legacy T -> P continuity proofs. ChittyID owns the canonical
 * identity relation and stores the authority manifest. No signing key is shared.
 */

const DEFAULT_MINT_URL = "https://mint.chitty.cc";
const ID_RE = /^\d{2}-[A-Z0-9]-[A-Z]{3}-\d{4}-[PLTEA]-\d{3,4}-[0-5]-\d{1,2}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

function entityType(id) {
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  return id.split("-")[4] || null;
}

async function serviceToken(env) {
  const binding = env?.CHITTY_AUTH_SERVICE_TOKEN;
  if (typeof binding === "string") return binding;
  if (binding?.get) {
    try {
      return await binding.get();
    } catch (error) {
      console.error(
        "[ChittyID] CHITTY_AUTH_SERVICE_TOKEN resolution failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return null;
}

function bearer(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function auditKey(auditId) {
  return `supersession:audit:${auditId}`;
}

function fromKey(id) {
  return `supersession:from:${id}`;
}

function toKey(id) {
  return `supersession:to:${id}`;
}

async function loadManifestByAuditId(env, auditId) {
  const raw = await env.CHITTYID_KV.get(auditKey(auditId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadManifestByPredecessor(env, predecessor) {
  const auditId = await env.CHITTYID_KV.get(fromKey(predecessor));
  if (!auditId) return null;
  return loadManifestByAuditId(env, auditId);
}

async function verifyWithMint(manifest, env, fetcher = fetch) {
  if (!manifest?.proof) {
    return { valid: false, reason: "missing_proof" };
  }

  const mintUrl = env?.CHITTYMINT_URL || DEFAULT_MINT_URL;
  let response;
  try {
    response = await fetcher(`${mintUrl}/api/verify-supersession`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manifest.proof),
    });
  } catch (error) {
    return {
      valid: false,
      unavailable: true,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { valid: false, reason: "mint_verifier_invalid_response" };
  }

  const valid =
    response.ok &&
    payload?.valid === true &&
    payload.supersedes === manifest.supersedes &&
    payload.successor === manifest.successor &&
    payload.auditId === manifest.auditId;

  return {
    valid,
    unavailable: false,
    reason: valid ? null : "mint_verification_failed",
  };
}

async function canonicalStatus(manifest, env) {
  if (!manifest?.auditId || !manifest?.supersedes || !manifest?.successor) {
    return { canonical: false, reason: "manifest_incomplete" };
  }

  const [fromAuditId, toAuditId] = await Promise.all([
    env.CHITTYID_KV.get(fromKey(manifest.supersedes)),
    env.CHITTYID_KV.get(toKey(manifest.successor)),
  ]);

  const canonical =
    fromAuditId === manifest.auditId && toAuditId === manifest.auditId;

  return {
    canonical,
    reason: canonical ? null : "manifest_not_current_authority_mapping",
  };
}

async function verifyStoredManifest(manifest, env, fetcher = fetch) {
  const [status, mint] = await Promise.all([
    canonicalStatus(manifest, env),
    verifyWithMint(manifest, env, fetcher),
  ]);

  return {
    valid: status.canonical && mint.valid,
    canonical: status.canonical,
    mintVerified: mint.valid,
    unavailable: mint.unavailable === true,
    reason: !status.canonical ? status.reason : mint.reason,
  };
}

export async function mintSupersession(request, env, fetcher = fetch) {
  if (!env?.CHITTYID_KV) {
    return json(
      { success: false, error: "CHITTYID_KV unavailable" },
      503,
    );
  }

  const expected = await serviceToken(env);
  const presented = bearer(request);
  if (!expected) {
    return json(
      { success: false, error: "Canonical service authorization unavailable" },
      503,
    );
  }
  if (!presented || presented !== expected) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }

  const predecessor = body?.supersedes;
  if (entityType(predecessor) !== "T") {
    return json(
      {
        success: false,
        error: "supersedes must be a well-formed legacy Thing (T) ChittyID",
      },
      400,
    );
  }

  const existing = await loadManifestByPredecessor(env, predecessor);
  if (existing) {
    const verification = await verifyStoredManifest(existing, env, fetcher);
    if (!verification.valid) {
      return json(
        {
          success: false,
          error: "Existing supersession manifest failed authority verification",
          verification,
        },
        verification.unavailable ? 503 : 409,
      );
    }

    return json({
      success: true,
      idempotent: true,
      manifest: existing,
      verification,
    });
  }

  const mintUrl = env?.CHITTYMINT_URL || DEFAULT_MINT_URL;
  let mintResponse;
  try {
    mintResponse = await fetcher(`${mintUrl}/api/mint`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${expected}`,
      },
      body: JSON.stringify({
        entityType: "person",
        metadata: {
          supersedes: predecessor,
          continuityAuthority: "id.chitty.cc",
        },
      }),
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: "ChittyMint unavailable",
        detail: error instanceof Error ? error.message : String(error),
      },
      503,
    );
  }

  let minted;
  try {
    minted = await mintResponse.json();
  } catch {
    return json(
      { success: false, error: "ChittyMint returned invalid response" },
      502,
    );
  }

  if (
    !mintResponse.ok ||
    minted?.success !== true ||
    entityType(minted.chittyId) !== "P" ||
    !minted.supersessionProof
  ) {
    return json(
      {
        success: false,
        error: "ChittyMint refused or failed supersession mint",
        mintStatus: mintResponse.status,
      },
      502,
    );
  }

  const proof = minted.supersessionProof;
  if (
    proof.supersedes !== predecessor ||
    proof.successor !== minted.chittyId ||
    !proof.auditId
  ) {
    return json(
      { success: false, error: "ChittyMint supersession proof mismatch" },
      502,
    );
  }

  const manifest = {
    version: "1",
    kind: "chittyid_supersession",
    authority: "id.chitty.cc",
    mintAuthority: "mint.chitty.cc",
    supersedes: predecessor,
    successor: minted.chittyId,
    auditId: proof.auditId,
    issuedAt: proof.issuedAt,
    recordedAt: new Date().toISOString(),
    proof,
  };

  const mintVerification = await verifyWithMint(manifest, env, fetcher);
  if (!mintVerification.valid) {
    return json(
      {
        success: false,
        error: "ChittyMint proof verification failed before recording",
        verification: mintVerification,
      },
      mintVerification.unavailable ? 503 : 502,
    );
  }

  // Store the immutable audit record first, then authority indexes. If a rare
  // concurrent mint races, verification below requires both indexes to point at
  // the same auditId, so an orphan proof cannot authorize downstream migration.
  await env.CHITTYID_KV.put(auditKey(manifest.auditId), JSON.stringify(manifest));
  await Promise.all([
    env.CHITTYID_KV.put(fromKey(manifest.supersedes), manifest.auditId),
    env.CHITTYID_KV.put(toKey(manifest.successor), manifest.auditId),
  ]);

  const verification = await verifyStoredManifest(manifest, env, fetcher);
  if (!verification.valid) {
    return json(
      {
        success: false,
        error: "Supersession manifest failed post-write authority verification",
        auditId: manifest.auditId,
        verification,
      },
      verification.unavailable ? 503 : 409,
    );
  }

  return json(
    {
      success: true,
      idempotent: false,
      manifest,
      verification,
    },
    201,
  );
}

export async function verifySupersession(request, env, fetcher = fetch) {
  if (!env?.CHITTYID_KV) {
    return json(
      { success: false, error: "CHITTYID_KV unavailable" },
      503,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }

  let manifest;
  if (body?.auditId) {
    manifest = await loadManifestByAuditId(env, body.auditId);
  } else if (body?.supersedes) {
    manifest = await loadManifestByPredecessor(env, body.supersedes);
  } else {
    return json(
      { success: false, error: "auditId or supersedes is required" },
      400,
    );
  }

  if (!manifest) {
    return json(
      { success: true, valid: false, canonical: false, reason: "not_found" },
      404,
    );
  }

  const verification = await verifyStoredManifest(manifest, env, fetcher);
  return json(
    {
      success: true,
      ...verification,
      relation: {
        auditId: manifest.auditId,
        supersedes: manifest.supersedes,
        successor: manifest.successor,
        issuedAt: manifest.issuedAt,
        recordedAt: manifest.recordedAt,
        authority: manifest.authority,
        mintAuthority: manifest.mintAuthority,
      },
    },
    verification.valid ? 200 : verification.unavailable ? 503 : 409,
  );
}

export const supersessionKeys = {
  auditKey,
  fromKey,
  toKey,
};
