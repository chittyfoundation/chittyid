#!/usr/bin/env node

/**
 * ChittyOS Session Sync Handler
 * Manages cross-session state persistence with ChittyAuth integration
 * Provides seamless continuity across Claude sessions and MCP projects
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

class ChittySessionSync {
  constructor() {
    this.sessionsDir = join(process.env.HOME || ".", ".chitty", "sessions");
    this.configFile = join(__dirname, "session-sync-config.json");
    this.chittyAuthEndpoint =
      process.env.CHITTYAUTH_ENDPOINT || "https://chittyauth-prod.workers.dev";
    // Note: Configure for account ending in 121 for production deployment
    this.authToken = process.env.CHITTY_AUTH_TOKEN;
    this.syncInterval = 15000; // 15 seconds
    this.currentSessionId =
      process.env.CLAUDE_SESSION_ID || this.generateSessionId();

    // Ensure directories exist
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }

    this.config = this.loadConfig();
    this.sessionState = this.loadSessionState();
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Load session sync configuration
   */
  loadConfig() {
    if (existsSync(this.configFile)) {
      try {
        return JSON.parse(readFileSync(this.configFile, "utf8"));
      } catch (error) {
        console.error("Failed to load session config:", error);
      }
    }

    const defaultConfig = {
      version: "1.0.0",
      session_sync: {
        enabled: true,
        auto_start: true,
        sync_interval: 15000,
        max_sessions: 50,
        retention_days: 30,
      },
      chittyauth_integration: {
        enabled: true,
        validate_sessions: true,
        cross_session_sync: true,
        session_timeout: 86400000, // 24 hours
      },
      sync_data: {
        mcp_projects: true,
        tool_usage: true,
        session_context: true,
        chittyid_operations: true,
        ai_conversations: false, // Privacy-sensitive
        file_operations: true,
      },
      security: {
        encrypt_sensitive: true,
        hash_sessions: true,
        audit_trail: true,
      },
    };

    this.saveConfig(defaultConfig);
    return defaultConfig;
  }

  /**
   * Save configuration
   */
  saveConfig(config = this.config) {
    try {
      writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }

  /**
   * Load current session state
   */
  loadSessionState() {
    const sessionFile = join(this.sessionsDir, `${this.currentSessionId}.json`);

    if (existsSync(sessionFile)) {
      try {
        const state = JSON.parse(readFileSync(sessionFile, "utf8"));
        console.log(
          `[SESSION] Loaded existing session: ${this.currentSessionId}`,
        );
        return state;
      } catch (error) {
        console.error("Failed to load session state:", error);
      }
    }

    // Create new session state
    const newState = {
      session_id: this.currentSessionId,
      created_at: new Date().toISOString(),
      last_sync: new Date().toISOString(),
      chittyauth: {
        authenticated: false,
        token_hash: null,
        validation_count: 0,
      },
      mcp_projects: [],
      tool_usage: {
        chittyid: { count: 0, last_used: null },
        langchain: { count: 0, last_used: null },
        chittycases: { count: 0, last_used: null },
      },
      context: {
        working_directory: process.cwd(),
        environment: process.env.NODE_ENV || "development",
        platform: process.platform,
        user_agent: "chittyos-session-sync/1.0.0",
      },
      operations: [],
      sync_history: [],
    };

    this.saveSessionState(newState);
    console.log(`[SESSION] Created new session: ${this.currentSessionId}`);
    return newState;
  }

  /**
   * Save session state
   */
  saveSessionState(state = this.sessionState) {
    const sessionFile = join(this.sessionsDir, `${this.currentSessionId}.json`);
    try {
      state.last_sync = new Date().toISOString();
      writeFileSync(sessionFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error("Failed to save session state:", error);
    }
  }

  /**
   * Authenticate session with ChittyAuth
   */
  async authenticateSession() {
    if (!this.config.chittyauth_integration.enabled || !this.authToken) {
      console.log("[SESSION] ChittyAuth integration disabled or no token");
      return false;
    }

    try {
      const response = await fetch(
        `${this.chittyAuthEndpoint}/api/v1/sessions/validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
          },
          body: JSON.stringify({
            session_id: this.currentSessionId,
            service: "session-sync",
            timestamp: new Date().toISOString(),
            context: this.sessionState.context,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `ChittyAuth session validation failed: ${response.status}`,
        );
      }

      const result = await response.json();

      // Update session state
      this.sessionState.chittyauth.authenticated = result.valid;
      this.sessionState.chittyauth.validation_count++;
      this.sessionState.chittyauth.last_validation = new Date().toISOString();

      if (result.valid) {
        console.log(
          `[SESSION] Authenticated with ChittyAuth: ${this.currentSessionId}`,
        );
      }

      this.saveSessionState();
      return result.valid;
    } catch (error) {
      console.error("[SESSION] ChittyAuth authentication failed:", error);
      this.sessionState.chittyauth.authenticated = false;
      this.sessionState.chittyauth.last_error = error.message;
      this.saveSessionState();
      return false;
    }
  }

  /**
   * Sync session with remote ChittyAuth storage
   */
  async syncWithRemote() {
    if (!this.config.chittyauth_integration.enabled || !this.authToken) {
      console.log("[SESSION] Remote sync disabled");
      return { synced: false, reason: "Integration disabled" };
    }

    try {
      // Upload current session state
      const response = await fetch(
        `${this.chittyAuthEndpoint}/api/v1/sessions/${this.currentSessionId}/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
          },
          body: JSON.stringify({
            session_data: this.sessionState,
            sync_type: "full_state",
            timestamp: new Date().toISOString(),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Session sync failed: ${response.status}`);
      }

      const result = await response.json();

      // Update sync history
      this.sessionState.sync_history.push({
        timestamp: new Date().toISOString(),
        type: "remote_sync",
        success: true,
        sync_id: result.sync_id,
      });

      // Keep only last 10 sync records
      if (this.sessionState.sync_history.length > 10) {
        this.sessionState.sync_history =
          this.sessionState.sync_history.slice(-10);
      }

      this.saveSessionState();
      console.log(`[SESSION] Synced with remote storage: ${result.sync_id}`);

      return {
        synced: true,
        sync_id: result.sync_id,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[SESSION] Remote sync failed:", error);

      this.sessionState.sync_history.push({
        timestamp: new Date().toISOString(),
        type: "remote_sync",
        success: false,
        error: error.message,
      });

      this.saveSessionState();
      return { synced: false, error: error.message };
    }
  }

  /**
   * Record tool usage
   */
  recordToolUsage(toolName, parameters, result) {
    if (!this.config.sync_data.tool_usage) return;

    const operation = {
      id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      tool: toolName,
      parameters: this.config.security.encrypt_sensitive
        ? "[ENCRYPTED]"
        : parameters,
      result_hash: this.hashObject(result),
      success: !result.error,
    };

    // Update tool usage stats
    if (this.sessionState.tool_usage[toolName]) {
      this.sessionState.tool_usage[toolName].count++;
      this.sessionState.tool_usage[toolName].last_used = operation.timestamp;
    } else {
      this.sessionState.tool_usage[toolName] = {
        count: 1,
        last_used: operation.timestamp,
      };
    }

    // Add to operations log
    this.sessionState.operations.push(operation);

    // Keep only last 100 operations
    if (this.sessionState.operations.length > 100) {
      this.sessionState.operations = this.sessionState.operations.slice(-100);
    }

    this.saveSessionState();
    console.log(`[SESSION] Recorded tool usage: ${toolName}`);
  }

  /**
   * Register MCP project with session
   */
  registerMCPProject(projectId, projectData) {
    if (!this.config.sync_data.mcp_projects) return;

    const existingIndex = this.sessionState.mcp_projects.findIndex(
      (p) => p.id === projectId,
    );

    const projectRecord = {
      id: projectId,
      name: projectData.name,
      registered_at: new Date().toISOString(),
      tools_available: projectData.tools_available || [],
      last_activity: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      this.sessionState.mcp_projects[existingIndex] = projectRecord;
    } else {
      this.sessionState.mcp_projects.push(projectRecord);
    }

    this.saveSessionState();
    console.log(`[SESSION] Registered MCP project: ${projectData.name}`);
  }

  /**
   * Get cross-session project history
   */
  getCrossSessionHistory() {
    const sessionFiles = readdirSync(this.sessionsDir).filter((f) =>
      f.endsWith(".json"),
    );
    const history = {
      total_sessions: sessionFiles.length,
      sessions: [],
      mcp_projects: new Set(),
      tool_usage: {},
    };

    for (const file of sessionFiles.slice(-10)) {
      // Last 10 sessions
      try {
        const sessionData = JSON.parse(
          readFileSync(join(this.sessionsDir, file), "utf8"),
        );

        history.sessions.push({
          session_id: sessionData.session_id,
          created_at: sessionData.created_at,
          last_sync: sessionData.last_sync,
          operations_count: sessionData.operations?.length || 0,
          mcp_projects_count: sessionData.mcp_projects?.length || 0,
        });

        // Aggregate MCP projects
        if (sessionData.mcp_projects) {
          sessionData.mcp_projects.forEach((p) =>
            history.mcp_projects.add(p.name),
          );
        }

        // Aggregate tool usage
        if (sessionData.tool_usage) {
          Object.keys(sessionData.tool_usage).forEach((tool) => {
            history.tool_usage[tool] =
              (history.tool_usage[tool] || 0) +
              sessionData.tool_usage[tool].count;
          });
        }
      } catch (error) {
        console.error(`Failed to read session file ${file}:`, error);
      }
    }

    history.mcp_projects = Array.from(history.mcp_projects);
    return history;
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync() {
    if (!this.config.session_sync.enabled) {
      console.log("[SESSION] Periodic sync disabled");
      return;
    }

    console.log(
      `[SESSION] Starting periodic sync every ${this.syncInterval}ms`,
    );

    setInterval(async () => {
      try {
        await this.syncWithRemote();
      } catch (error) {
        console.error("[SESSION] Periodic sync error:", error);
      }
    }, this.syncInterval);
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions() {
    const retentionMs =
      this.config.session_sync.retention_days * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - retentionMs);

    const sessionFiles = readdirSync(this.sessionsDir).filter((f) =>
      f.endsWith(".json"),
    );
    let cleanedCount = 0;

    for (const file of sessionFiles) {
      const filePath = join(this.sessionsDir, file);
      try {
        const sessionData = JSON.parse(readFileSync(filePath, "utf8"));
        const createdAt = new Date(sessionData.created_at);

        if (createdAt < cutoffDate) {
          require("fs").unlinkSync(filePath);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Failed to process session file ${file}:`, error);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[SESSION] Cleaned up ${cleanedCount} old sessions`);
    }

    return cleanedCount;
  }

  /**
   * Hash object for security
   */
  hashObject(obj) {
    if (!this.config.security.hash_sessions) return null;

    return createHash("sha256")
      .update(JSON.stringify(obj))
      .digest("hex")
      .substr(0, 16);
  }

  /**
   * Health check
   */
  async healthCheck() {
    const history = this.getCrossSessionHistory();

    return {
      healthy: true,
      session_sync_version: this.config.version,
      current_session: {
        id: this.currentSessionId,
        created_at: this.sessionState.created_at,
        last_sync: this.sessionState.last_sync,
        authenticated: this.sessionState.chittyauth.authenticated,
        operations_count: this.sessionState.operations.length,
        mcp_projects_count: this.sessionState.mcp_projects.length,
      },
      cross_session_stats: {
        total_sessions: history.total_sessions,
        recent_sessions: history.sessions.length,
        unique_mcp_projects: history.mcp_projects.length,
        total_tool_usage: Object.values(history.tool_usage).reduce(
          (a, b) => a + b,
          0,
        ),
      },
      configuration: {
        sync_enabled: this.config.session_sync.enabled,
        chittyauth_enabled: this.config.chittyauth_integration.enabled,
        sync_interval: this.syncInterval,
        retention_days: this.config.session_sync.retention_days,
      },
      directories: {
        sessions_dir: this.sessionsDir,
        config_file: this.configFile,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const sessionSync = new ChittySessionSync();
  const command = process.argv[2];

  switch (command) {
    case "start":
      console.log("[SESSION] Starting session sync...");
      sessionSync.authenticateSession().then((authenticated) => {
        if (authenticated) {
          sessionSync.startPeriodicSync();
        } else {
          console.log("[SESSION] Running without ChittyAuth authentication");
          sessionSync.startPeriodicSync();
        }
      });
      break;

    case "auth":
      sessionSync.authenticateSession().then((result) => {
        console.log(`[SESSION] Authentication result: ${result}`);
      });
      break;

    case "sync":
      sessionSync.syncWithRemote().then((result) => {
        console.log("[SESSION] Sync result:");
        console.log(JSON.stringify(result, null, 2));
      });
      break;

    case "record":
      const toolName = process.argv[3];
      const params = process.argv[4] || "{}";
      const result = process.argv[5] || '{"success": true}';

      if (!toolName) {
        console.error(
          "Tool name required: node session-sync.js record <tool-name> [params] [result]",
        );
        process.exit(1);
      }

      try {
        sessionSync.recordToolUsage(
          toolName,
          JSON.parse(params),
          JSON.parse(result),
        );
        console.log(`[SESSION] Recorded usage for tool: ${toolName}`);
      } catch (error) {
        console.error("Failed to record tool usage:", error);
      }
      break;

    case "mcp":
      const projectId = process.argv[3];
      const projectName = process.argv[4] || "unnamed-project";

      if (!projectId) {
        console.error(
          "Project ID required: node session-sync.js mcp <project-id> [project-name]",
        );
        process.exit(1);
      }

      sessionSync.registerMCPProject(projectId, {
        name: projectName,
        tools_available: ["chittyid", "langchain", "chittycases"],
      });
      console.log(`[SESSION] Registered MCP project: ${projectName}`);
      break;

    case "history":
      const history = sessionSync.getCrossSessionHistory();
      console.log("Cross-Session History:");
      console.log("=====================");
      console.log(JSON.stringify(history, null, 2));
      break;

    case "cleanup":
      const cleaned = sessionSync.cleanupOldSessions();
      console.log(`[SESSION] Cleanup completed: ${cleaned} sessions removed`);
      break;

    case "health":
      sessionSync.healthCheck().then((result) => {
        console.log(JSON.stringify(result, null, 2));
      });
      break;

    default:
      console.log(`
ChittyOS Session Sync Commands:
  start                           - Start session sync with ChittyAuth
  auth                           - Authenticate current session
  sync                           - Sync session with remote storage
  record <tool> [params] [result] - Record tool usage
  mcp <project-id> [name]        - Register MCP project
  history                        - Show cross-session history
  cleanup                        - Clean up old sessions
  health                         - Check session sync health

Environment Variables:
  CHITTY_AUTH_TOKEN             - ChittyAuth authentication token
  CHITTYAUTH_ENDPOINT           - ChittyAuth service endpoint
  CLAUDE_SESSION_ID             - Current Claude session ID

Features:
  • Cross-session state persistence
  • ChittyAuth integration for secure sync
  • MCP project tracking across sessions
  • Tool usage analytics and history
  • Automatic cleanup of old sessions
  • Secure session authentication

Example Usage:
  node session-sync.js start
  node session-sync.js record chittyid '{"command":"gen","type":"person"}' '{"success":true,"id":"01-1-ABC-1234-P-25-1-82"}'
  node session-sync.js mcp mcp-demo-123 "chittyid-foundation"
  node session-sync.js history
`);
  }
}

export { ChittySessionSync };
