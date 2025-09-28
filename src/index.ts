// TypeScript entry point - redirects to new worker system
// @ts-ignore - worker.js is a JavaScript file
import worker from "./worker.js";

interface Env {
  AI: Ai;
  CHITTY_IDS: KVNamespace;
  CHITTY_SECRETS: KVNamespace;
  CHITTY_VECTORS: VectorizeIndex;
  CHITTY_UPDATES: DurableObjectNamespace;
  CHITTY_ANALYTICS: AnalyticsEngineDataset;
  AI_GATEWAY?: string;
}

// Export new worker system with TypeScript types
export default worker as {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
  scheduled?(event: any, env: Env, ctx: ExecutionContext): Promise<void>;
};
