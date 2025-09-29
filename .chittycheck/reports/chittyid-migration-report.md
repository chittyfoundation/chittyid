# ChittyID Migration Report

- Generated: 2025-09-29T07:14:43.800779+00:00
- Total occurrences: 97

## Recommended Steps
1. Replace local ID generation with the ChittyID service (https://id.chitty.cc).
2. Import or implement a shared helper that calls the service using your `CHITTY_ID_TOKEN`.
3. Remove legacy helpers that wrap `crypto.randomUUID`, `uuid`, or `nanoid`.

## Service Helper Example (Node 18+)
```ts
const CHITTY_ID_SERVICE = process.env.CHITTY_ID_SERVICE ?? 'https://id.chitty.cc';

export async function mintChittyId(entityType = 'GENERIC') {
  const token = process.env.CHITTY_ID_TOKEN;
  if (!token) {
    throw new Error('CHITTY_ID_TOKEN is missing. Run `chittycheck --fix id` to configure it.');
  }
  const response = await fetch(`${CHITTY_ID_SERVICE}/api/mint`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ entityType })
  });
  if (!response.ok) {
    throw new Error(`Failed to mint ChittyID: ${response.status}`);
  }
  const data = await response.json();
  return data.id;
}
```

## Pattern Counts
| Pattern | Count |
| --- | ---: |
| Math.random | 73 |
| crypto.randomUUID | 3 |
| nanoid | 11 |
| uuid | 10 |

## Occurrences
- `session-sync.js`:48 – Math.random – `return 'session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}';`
- `session-sync.js`:304 – Math.random – `id: 'op-${Date.now()}-${Math.random().toString(36).substr(2, 6)}',`
- `chittyid-service-worker.js`:626 – Math.random – `const randomComponent = Math.floor(Math.random() * 100)`
- `demo-mcp-sync.js`:199 – Math.random – `pid: Math.floor(Math.random() * 10000) + 1000, // Demo PID`
- `research/chittyentry/server/security-middleware.ts`:81 – Math.random – `.update('${Date.now()}-${Math.random()}')`
- `research/chittyentry/client/src/components/ui/sidebar.tsx`:663 – Math.random – `return '${Math.floor(Math.random() * 40) + 50}%'`
- `research/chittyentry/client/src/lib/utils.ts`:83 – Math.random – `return messages[Math.floor(Math.random() * messages.length)];`
- `research/chittyentry/client/src/lib/utils.ts`:94 – Math.random – `result += digits.charAt(Math.floor(Math.random() * digits.length));`
- `research/chittyledger/client/src/components/ui/sidebar.tsx`:663 – Math.random – `return '${Math.floor(Math.random() * 40) + 50}%'`
- `research/chittyledger/client/src/pages/notion-sync.tsx`:26 – Math.random – `setEvidenceCount(prev => prev + Math.floor(Math.random() * 10));`
- `research/chittyfinance/database/system.schema.ts`:7 – uuid – `id: uuid('id').primaryKey().defaultRandom(),`
- `research/chittyfinance/database/system.schema.ts`:15 – uuid – `id: uuid('id').primaryKey().defaultRandom(),`
- `research/chittyfinance/database/system.schema.ts`:16 – uuid – `tenantId: uuid('tenant_id').notNull().references(() => tenants.id),`
- `research/chittyfinance/database/system.schema.ts`:27 – uuid – `id: uuid('id').primaryKey().defaultRandom(),`
- `research/chittyfinance/database/system.schema.ts`:28 – uuid – `tenantId: uuid('tenant_id').notNull().references(() => tenants.id),`
- `research/chittyfinance/database/system.schema.ts`:29 – uuid – `userId: uuid('user_id').notNull().references(() => users.id),`
- `research/chittyfinance/database/system.schema.ts`:39 – uuid – `id: uuid('id').primaryKey().defaultRandom(),`
- `research/chittyfinance/database/system.schema.ts`:40 – uuid – `tenantId: uuid('tenant_id').notNull().references(() => tenants.id),`
- `research/chittyfinance/database/system.schema.ts`:41 – uuid – `userId: uuid('user_id').notNull().references(() => users.id),`
- `research/chittyfinance/client/src/components/ui/sidebar.tsx`:654 – Math.random – `return '${Math.floor(Math.random() * 40) + 50}%'`
- `research/chittycases/chittychain/app/api/property/ingest/route.ts`:70 – Math.random – `return 'Qm${Math.random().toString(36).substring(2, 15)}';`
- `research/chittycases/chittychain/lib/property/divorce-workflow.ts`:116 – Math.random – `transactionHash: '0x${Math.random().toString(36).substring(2)}', // Mock`
- `research/chittycases/chittychain/lib/property/divorce-workflow.ts`:117 – Math.random – `blockNumber: Math.floor(Math.random() * 1000000),`
- `research/chittycases/chittychain/lib/blockchain/chittychain.ts`:115 – Math.random – `fullFact.block_number = Math.floor(Math.random() * 1000000);`
- `research/chittycases/chittychain/lib/blockchain/chittychain.ts`:146 – Math.random – `return Math.random().toString(36).substring(2, 15);`
- `research/chittycases/chittychain/lib/evidence-ledger/schemas/formulas.ts`:62 – Math.random – `const random = Math.random().toString(36).substring(2, 8);`
- `research/chittycases/chittychain/lib/evidence-ledger/schemas/formulas.ts`:68 – Math.random – `const random = Math.random().toString(36).substring(2, 8);`
- `research/chittycases/chittychain/lib/evidence-ledger/schemas/formulas.ts`:74 – Math.random – `const random = Math.random().toString(36).substring(2, 6);`
- `research/chittycases/chittychain/lib/evidence-ledger/schemas/formulas.ts`:89 – Math.random – `const random = Math.floor(Math.random() * 99999999);`
- `research/chittycases/cloudflare-workers/lib/chitty-core-mock.js`:92 – Math.random – `const random = Math.random().toString(36).substr(2, 9);`
- `research/chittychain/demo_property_nft.js`:70 – Math.random – `const tokenId = Math.floor(Math.random() * 10000) + 1;`
- `research/chittychain/tests/security/security-audit.test.ts`:335 – Math.random – `registrationNumber: 'REG${Math.random().toString().slice(2, 10)}'`
- `research/chittychain/tests/integration/evidence-flow.test.ts`:377 – Math.random – `registrationNumber: 'REG${Math.random().toString().slice(2, 10)}'`
- `research/chittychain/server/air/AIRGovernance.ts`:194 – Math.random – `const teamId = 'tea-${Date.now()}-${Math.random().toString(36).substr(2, 9)}';`
- `research/chittychain/server/air/AIRGovernance.ts`:359 – Math.random – `return 85 + Math.random() * 10; // 85-95`
- `research/chittychain/server/air/AIRGovernance.ts`:364 – Math.random – `return 80 + Math.random() * 15; // 80-95`
- `research/chittychain/server/routes/ai-analysis.ts`:189 – Math.random – `createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random dates in last…`
- `research/chittychain/server/routes/auth/claudeCode.ts`:70 – Math.random – `const barNumber = 'BAR${Math.random().toString().slice(2, 8)}';`
- `research/chittychain/server/services/ChittyBeaconService.ts`:219 – Math.random – `recordId: Math.random().toString(36).substr(2, 9),`
- `research/chittychain/server/services/ChittyIDService.ts`:99 – Math.random – `const id = Math.random().toString(36).substr(2, 9);`
- `research/chittychain/client/src/components/ui/sidebar.tsx`:663 – Math.random – `return '${Math.floor(Math.random() * 40) + 50}%'`
- `research/chittychain/client/src/components/evidence/EvidenceUpload.tsx`:83 – Math.random – `id: Math.random().toString(36).substr(2, 9),`
- `research/chittychain/client/src/components/ai/EvidenceAnalysisModal.tsx`:220 – Math.random – `return prev + Math.random() * 15;`
- `research/chittychain/client/src/lib/chittyid.ts`:52 – Math.random – `const sequence = Math.random().toString(36).substr(2, 4).toUpperCase();`
- `research/chittycore/src/verify/index.ts`:72 – uuid – `uuid: z.string().uuid(),`
- `research/chittycore/src/auth/index.ts`:77 – nanoid – `.setJti(nanoid())`
- `research/chittycore/src/auth/index.ts`:80 – nanoid – `const refreshToken = nanoid(32)`
- `research/chittycore/src/auth/index.ts`:84 – nanoid – `id: nanoid(),`
- `research/chittycore/src/canon/index.ts`:71 – nanoid – `const canonId = 'CANON_${nanoid(21)}'`
- `research/chittycore/src/canon/index.ts`:81 – nanoid – `id: nanoid(),`
- `research/chittycore/src/canon/index.ts`:136 – nanoid – `id: nanoid(),`
- `research/chittycore/src/registry/index.ts`:96 – nanoid – `id: service.name + '_' + nanoid(8)`
- `research/chittycore/src/registry/index.ts`:192 – nanoid – `id: 'conn_${nanoid()}',`
- `research/chittycore/src/beacon/index.ts`:106 – nanoid – `return 'npm-${pkg.name}-${nanoid(8)}'`
- `research/chittycore/src/beacon/index.ts`:108 – nanoid – `return 'chitty-${nanoid()}'`
- `research/chittyassets/server/vite.ts`:59 – nanoid – `'src="/src/main.tsx?v=${nanoid()}"',`
- `research/chittyassets/server/chittyCloudMcp.ts`:229 – Math.random – `Math.floor(Math.random() * 16).toString(16)`
- `research/chittyassets/server/auth.ts`:139 – crypto.randomUUID – `const userId = crypto.randomUUID();`
- `research/chittyassets/scripts/install-github-app.js`:276 – Math.random – `return Math.random().toString(36).substring(2, 15);`
- `research/chittyassets/client/src/components/ui/sidebar.tsx`:663 – Math.random – `return '${Math.floor(Math.random() * 40) + 50}%'`
- `tests/integration/topic-sync.test.js`:58 – Math.random – `data: [Array(384).fill(0).map(() => Math.random())]`
- `tests/integration/topic-sync.test.js`:92 – Math.random – `const mockEmbedding = Array(384).fill(0).map(() => Math.random());`
- `tests/integration/topic-sync.test.js`:483 – Math.random – `messages: Array(Math.floor(Math.random() * 10) + 1).fill(null).map((_, j) => ({`
- `tests/integration/topic-sync.test.js`:484 – Math.random – `timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString()`
- `tests/integration/topic-sync.test.js`:621 – Math.random – `data: topics.map(() => Array(384).fill(0).map(() => Math.random()))`
- `tests/integration/chittyrouter-gateway.test.js`:441 – Math.random – `data: [Array(384).fill(0).map(() => Math.random())]`
- `functions/api/[[route]].js`:54 – Math.random – `return Math.floor(Math.random() * 9999)`
- `src/middleware/request-interceptor.js`:557 – Math.random – `if (Math.random() < 0.1) {`
- `src/pipeline/index.js`:394 – Math.random – `const sequential = Math.floor(Math.random() * 9999).toString().padStart(4, '0');`
- `src/agents/deduplication.js`:515 – Math.random – `confidence: Math.random() * 0.5, // Random low confidence`
- `src/agents/performance.js`:66 – Math.random – `const variance = Math.random() * regionLatency.variance;`
- `src/agents/performance.js`:395 – Math.random – `cpu_usage: Math.random() * 100, // Simulated`
- `src/agents/performance.js`:396 – Math.random – `memory_usage: Math.random() * 100, // Simulated`
- `src/agents/performance.js`:551 – Math.random – `return cached ? JSON.parse(cached).average : Math.random() * 200 + 50;`
- `src/agents/performance.js`:557 – Math.random – `return cached ? JSON.parse(cached).rate : Math.random() * 30 + 70; // 70-100%`
- `src/agents/performance.js`:563 – Math.random – `return cached ? JSON.parse(cached).rps : Math.random() * 500 + 100; // 100-600 RPS`
- `src/agents/performance.js`:569 – Math.random – `return cached ? JSON.parse(cached).rate : Math.random() * 5; // 0-5%`
- `src/agents/routing.js`:350 – Math.random – `load: Math.random(), // Random load between 0-1`
- `src/agents/routing.js`:418 – Math.random – `const vectorId = 'routing_${Date.now()}_${Math.random().toString(36).substring(7)}';`
- `src/agents/versioning.js`:234 – Math.random – `confidence: Math.random() * 0.2 + 0.8, // 0.8-1.0`
- `src/agents/versioning.js`:278 – Math.random – `success: Math.random() > 0.3,`
- `src/agents/versioning.js`:279 – Math.random – `confidence: Math.random() * 0.3 + 0.7,`
- `src/integrations/chittyrouter-gateway.js`:709 – Math.random – `const vectorId = 'route_${Date.now()}_${Math.random().toString(36).substring(7)}';`
- `src/workers/chittyid-websocket.ts`:42 – crypto.randomUUID – `const sessionId = crypto.randomUUID();`
- `src/workers/notion-sync-worker.js`:347 – Math.random – `const jitter = Math.random() * 1000;`
- `src/enforcement/compliance-monitor.js`:382 – Math.random – `if (Math.random() < 0.1) {`
- `src/enforcement/compliance-monitor.js`:454 – Math.random – `return 'monitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}';`
- `src/enforcement/compliance-monitor.js`:514 – Math.random – `const reportId = 'report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}';`
- `src/services/topic-sync.js`:25 – Math.random – `const random = Math.random().toString(36).substring(2);`
- `src/services/topic-sync.js`:156 – Math.random – `.map(() => Math.random()), // Mock embedding for now`
- `src/services/topic-sync.js`:260 – Math.random – `id: 'msg_${Date.now()}_${Math.random().toString(36).substring(2)}',`
- `src/services/topic-sync.js`:381 – Math.random – `id: 'action_${Date.now()}_${Math.random().toString(36).substring(2)}',`
- `src/services/topic-sync.js`:393 – Math.random – `id: 'decision_${Date.now()}_${Math.random().toString(36).substring(2)}',`
- `src/services/notion-sync.js`:646 – Math.random – `const jitter = Math.random() * 1000;`
- `src/services/session-sync.js`:598 – Math.random – `const random = Math.random().toString(36).substr(2, 9);`
- `src/services/pipeline.js`:513 – Math.random – `const sequential = Math.floor(Math.random() * 9999).toString().padStart(4, '0');`
- `src/hybrid/registry-governance.js`:409 – crypto.randomUUID – `id: crypto.randomUUID(),`
