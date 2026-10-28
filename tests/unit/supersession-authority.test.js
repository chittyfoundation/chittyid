import { describe, expect, it } from "vitest";
import {
  mintSupersession,
  verifySupersession,
  supersessionKeys,
} from "../../src/services/supersession-authority.js";

class MockKV {
  constructor() {
    this.map = new Map();
  }
  async get(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  async put(key, value) {
    this.map.set(key, value);
  }
}

const predecessor = "03-1-USA-2629-T-2601-0-21";
const successor = "03-1-USA-3708-P-2601-0-51";
const proof = {
  version: "1",
  supersedes: predecessor,
  successor,
  auditId: "audit-123",
  signature: "signed-proof",
  issuer: "mint.chitty.cc",
  issuedAt: "2026-10-28T03:55:00.000Z",
  drandRound: 12345,
};

function env() {
  return {
    CHITTYID_KV: new MockKV(),
    CHITTYMINT_URL: "https://mint.example",
    CHITTY_AUTH_SERVICE_TOKEN: {
      async get() {
        return "service-token";
      },
    },
  };
}

function request(path, body, token = "service-token") {
  return new Request("https://id.example" + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
}

function fetcherFactory() {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/api/mint")) {
      return Response.json({
        success: true,
        chittyId: successor,
        supersessionProof: proof,
      });
    }
    if (url.endsWith("/api/verify-supersession")) {
      const presented = JSON.parse(options.body);
      return Response.json({
        success: true,
        valid:
          presented.auditId === proof.auditId &&
          presented.supersedes === predecessor &&
          presented.successor === successor,
        supersedes: presented.supersedes,
        successor: presented.successor,
        auditId: presented.auditId,
      });
    }
    throw new Error("unexpected URL " + url);
  };
  return { calls, fetcher };
}

describe("ChittyID supersession authority", () => {
  it("requires the canonical service principal to mint a relation", async () => {
    const e = env();
    const { fetcher } = fetcherFactory();
    const response = await mintSupersession(
      request("/api/supersession/mint", { supersedes: predecessor }, "wrong"),
      e,
      fetcher,
    );
    expect(response.status).toBe(401);
  });

  it("mints, verifies, and records one canonical T-to-P relation", async () => {
    const e = env();
    const { calls, fetcher } = fetcherFactory();
    const response = await mintSupersession(
      request("/api/supersession/mint", { supersedes: predecessor }),
      e,
      fetcher,
    );
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.verification).toMatchObject({
      valid: true,
      canonical: true,
      mintVerified: true,
    });
    expect(body.manifest).toMatchObject({
      auditId: proof.auditId,
      supersedes: predecessor,
      successor,
      authority: "id.chitty.cc",
    });

    expect(
      await e.CHITTYID_KV.get(supersessionKeys.fromKey(predecessor)),
    ).toBe(proof.auditId);
    expect(
      await e.CHITTYID_KV.get(supersessionKeys.toKey(successor)),
    ).toBe(proof.auditId);
    expect(
      await e.CHITTYID_KV.get(supersessionKeys.auditKey(proof.auditId)),
    ).toContain('"kind":"chittyid_supersession"');

    expect(calls.filter((call) => call.url.endsWith("/api/mint"))).toHaveLength(1);
  });

  it("is idempotent by predecessor and does not mint another successor", async () => {
    const e = env();
    const first = fetcherFactory();
    await mintSupersession(
      request("/api/supersession/mint", { supersedes: predecessor }),
      e,
      first.fetcher,
    );

    const second = fetcherFactory();
    const response = await mintSupersession(
      request("/api/supersession/mint", { supersedes: predecessor }),
      e,
      second.fetcher,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.idempotent).toBe(true);
    expect(second.calls.filter((call) => call.url.endsWith("/api/mint"))).toHaveLength(0);
    expect(second.calls.filter((call) => call.url.endsWith("/api/verify-supersession"))).toHaveLength(1);
  });

  it("converges when concurrent first requests both reach predecessor-idempotent ChittyMint", async () => {
    const e = env();
    let releaseMint;
    const gate = new Promise((resolve) => {
      releaseMint = resolve;
    });
    let mintCalls = 0;

    const fetcher = async (url, _options) => {
      if (url.endsWith("/api/mint")) {
        mintCalls += 1;
        await gate;
        // This fixture models the live ChittyMint contract after #20:
        // repeated/concurrent requests for metadata.supersedes return the same
        // successor and proof from the predecessor-keyed Durable Object.
        return Response.json({
          success: true,
          chittyId: successor,
          supersessionProof: proof,
          idempotent: mintCalls > 1,
        });
      }
      if (url.endsWith("/api/verify-supersession")) {
        return Response.json({
          success: true,
          valid: true,
          supersedes: predecessor,
          successor,
          auditId: proof.auditId,
        });
      }
      throw new Error("unexpected URL " + url);
    };

    const first = mintSupersession(
      request("/api/supersession/mint", { supersedes: predecessor }),
      e,
      fetcher,
    );
    const second = mintSupersession(
      request("/api/supersession/mint", { supersedes: predecessor }),
      e,
      fetcher,
    );

    await Promise.resolve();
    releaseMint();

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    const [firstBody, secondBody] = await Promise.all([
      firstResponse.json(),
      secondResponse.json(),
    ]);

    expect(firstBody.manifest.successor).toBe(successor);
    expect(secondBody.manifest.successor).toBe(successor);
    expect(firstBody.manifest.auditId).toBe(proof.auditId);
    expect(secondBody.manifest.auditId).toBe(proof.auditId);
    expect(
      await e.CHITTYID_KV.get(supersessionKeys.fromKey(predecessor)),
    ).toBe(proof.auditId);
    expect(mintCalls).toBe(2);
  });

  it("verifies only the currently indexed authority relation", async () => {
    const e = env();
    const { fetcher } = fetcherFactory();
    await mintSupersession(
      request("/api/supersession/mint", { supersedes: predecessor }),
      e,
      fetcher,
    );

    const valid = await verifySupersession(
      request("/api/supersession/verify", { supersedes: predecessor }, null),
      e,
      fetcher,
    );
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({
      valid: true,
      canonical: true,
      relation: { supersedes: predecessor, successor },
    });

    await e.CHITTYID_KV.put(
      supersessionKeys.fromKey(predecessor),
      "different-audit-id",
    );

    const stale = await verifySupersession(
      request("/api/supersession/verify", { auditId: proof.auditId }, null),
      e,
      fetcher,
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      valid: false,
      canonical: false,
      reason: "manifest_not_current_authority_mapping",
    });
  });

  it("rejects non-T predecessors before calling ChittyMint", async () => {
    const e = env();
    const { calls, fetcher } = fetcherFactory();
    const response = await mintSupersession(
      request("/api/supersession/mint", { supersedes: successor }),
      e,
      fetcher,
    );
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
