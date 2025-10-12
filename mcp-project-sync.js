#!/usr/bin/env node

/**
 * MCP Project Sync Handler
 * Synchronizes MCP server projects with ChittyAuth authentication
 * Provides secure project management and cross-session state persistence
 */

import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

class MCPProjectSync {
  constructor() {
    this.config = this.loadConfig();
    this.chittyAuthEndpoint =
      process.env.CHITTYAUTH_ENDPOINT || "https://chittyauth-prod.workers.dev";
    this.syncInterval = 30000; // 30 seconds
    this.projectsDir = join(process.env.HOME || ".", ".chitty", "mcp-projects");
    this.authToken = process.env.CHITTY_AUTH_TOKEN;

    // Ensure projects directory exists
    if (!existsSync(this.projectsDir)) {
      mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  /**
   * Load MCP project sync configuration
   */
  loadConfig() {
    try {
      const configPath = join(__dirname, "mcp-sync-config.json");
      if (existsSync(configPath)) {
        return JSON.parse(readFileSync(configPath, "utf8"));
      }

      // Default configuration
      const defaultConfig = {
        version: "1.0.0",
        sync_enabled: true,
        projects: [],
        auth_integration: {
          enabled: true,
          provider: "chittyauth",
          session_validation: true,
          cross_session_sync: true,
        },
        mcp_servers: [
          {
            name: "chittyid-mcp",
            executable: "node",
            args: ["mcp-handler.js"],
            env: {
              CHITTY_API_KEY: process.env.CHITTY_API_KEY,
              OPENAI_API_KEY: process.env.OPENAI_API_KEY,
              ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
            },
          },
        ],
      };

      // Save default config
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    } catch (error) {
      console.error("Failed to load MCP sync config:", error);
      return { version: "1.0.0", sync_enabled: false, projects: [] };
    }
  }

  /**
   * Authenticate with ChittyAuth
   */
  async authenticateWithChittyAuth(sessionId) {
    if (!this.authToken) {
      throw new Error("CHITTY_AUTH_TOKEN is required for project sync");
    }

    try {
      const response = await fetch(
        `${this.chittyAuthEndpoint}/api/v1/validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            service: "mcp-project-sync",
            timestamp: new Date().toISOString(),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`ChittyAuth validation failed: ${response.status}`);
      }

      const result = await response.json();
      return result.valid;
    } catch (error) {
      console.error("ChittyAuth authentication failed:", error);
      return false;
    }
  }

  /**
   * Sync project state with ChittyAuth
   */
  async syncProjectState(projectId, state) {
    if (!this.config.auth_integration.enabled) {
      return { synced: false, reason: "Auth integration disabled" };
    }

    try {
      const response = await fetch(
        `${this.chittyAuthEndpoint}/api/v1/projects/${projectId}/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
          },
          body: JSON.stringify({
            project_id: projectId,
            state: state,
            mcp_version: this.config.version,
            timestamp: new Date().toISOString(),
            sync_type: "state_update",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Project sync failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Project sync failed for ${projectId}:`, error);
      return { synced: false, error: error.message };
    }
  }

  /**
   * Get project state from ChittyAuth
   */
  async getProjectState(projectId) {
    if (!this.config.auth_integration.enabled) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.chittyAuthEndpoint}/api/v1/projects/${projectId}/state`,
        {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null; // Project not found
        }
        throw new Error(`Failed to get project state: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to get project state for ${projectId}:`, error);
      return null;
    }
  }

  /**
   * Register MCP project with ChittyAuth
   */
  async registerProject(projectConfig) {
    const projectId = projectConfig.id || `mcp-${Date.now()}`;

    try {
      // Validate session
      const sessionValid = await this.authenticateWithChittyAuth(
        projectConfig.session_id,
      );
      if (!sessionValid) {
        throw new Error("Invalid session for project registration");
      }

      // Register project
      const response = await fetch(
        `${this.chittyAuthEndpoint}/api/v1/projects`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
          },
          body: JSON.stringify({
            project_id: projectId,
            name: projectConfig.name,
            description: projectConfig.description,
            mcp_servers: projectConfig.mcp_servers,
            capabilities: projectConfig.capabilities,
            metadata: {
              created_by: "mcp-project-sync",
              version: this.config.version,
              sync_enabled: true,
            },
            timestamp: new Date().toISOString(),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Project registration failed: ${response.status}`);
      }

      const result = await response.json();

      // Update local config
      this.config.projects.push({
        id: projectId,
        name: projectConfig.name,
        registered_at: new Date().toISOString(),
        chittyauth_id: result.project_id,
      });

      this.saveConfig();

      return {
        success: true,
        project_id: projectId,
        chittyauth_id: result.project_id,
        message: "Project registered successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Start MCP servers for a project
   */
  async startMCPServers(projectId) {
    const project = this.config.projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const servers = [];

    for (const serverConfig of this.config.mcp_servers) {
      try {
        const serverProcess = spawn(
          serverConfig.executable,
          serverConfig.args,
          {
            env: {
              ...process.env,
              ...serverConfig.env,
              MCP_PROJECT_ID: projectId,
              CHITTYAUTH_TOKEN: this.authToken,
            },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );

        servers.push({
          name: serverConfig.name,
          pid: serverProcess.pid,
          process: serverProcess,
          started_at: new Date().toISOString(),
        });

        console.log(
          `Started MCP server: ${serverConfig.name} (PID: ${serverProcess.pid})`,
        );

        // Handle server output
        serverProcess.stdout.on("data", (data) => {
          console.log(`[${serverConfig.name}] ${data.toString()}`);
        });

        serverProcess.stderr.on("data", (data) => {
          console.error(`[${serverConfig.name}] ERROR: ${data.toString()}`);
        });

        serverProcess.on("close", (code) => {
          console.log(
            `[${serverConfig.name}] Process exited with code ${code}`,
          );
        });
      } catch (error) {
        console.error(
          `Failed to start MCP server ${serverConfig.name}:`,
          error,
        );
      }
    }

    return servers;
  }

  /**
   * Sync project data periodically
   */
  async startPeriodicSync() {
    if (!this.config.sync_enabled) {
      console.log("Project sync disabled");
      return;
    }

    console.log(`Starting periodic sync every ${this.syncInterval}ms`);

    setInterval(async () => {
      try {
        for (const project of this.config.projects) {
          // Get current project state
          const localState = this.getLocalProjectState(project.id);
          const remoteState = await this.getProjectState(project.id);

          // Sync if states differ
          if (this.statesChanged(localState, remoteState)) {
            await this.syncProjectState(project.id, localState);
            console.log(`Synced project ${project.id}`);
          }
        }
      } catch (error) {
        console.error("Periodic sync error:", error);
      }
    }, this.syncInterval);
  }

  /**
   * Get local project state
   */
  getLocalProjectState(projectId) {
    const projectFile = join(this.projectsDir, `${projectId}.json`);
    if (existsSync(projectFile)) {
      try {
        return JSON.parse(readFileSync(projectFile, "utf8"));
      } catch (error) {
        console.error(`Failed to read project state for ${projectId}:`, error);
      }
    }

    return {
      project_id: projectId,
      last_modified: new Date().toISOString(),
      mcp_servers: [],
      session_data: {},
      tools_used: [],
    };
  }

  /**
   * Save local project state
   */
  saveLocalProjectState(projectId, state) {
    const projectFile = join(this.projectsDir, `${projectId}.json`);
    try {
      writeFileSync(projectFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error(`Failed to save project state for ${projectId}:`, error);
    }
  }

  /**
   * Check if states have changed
   */
  statesChanged(localState, remoteState) {
    if (!remoteState) return true;

    return (
      localState.last_modified !== remoteState.last_modified ||
      JSON.stringify(localState.session_data) !==
        JSON.stringify(remoteState.session_data)
    );
  }

  /**
   * Save configuration
   */
  saveConfig() {
    try {
      const configPath = join(__dirname, "mcp-sync-config.json");
      writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Check ChittyAuth connectivity
      const authResponse = await fetch(`${this.chittyAuthEndpoint}/health`, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });

      const authHealthy = authResponse.ok;

      return {
        healthy: true,
        mcp_sync_version: this.config.version,
        sync_enabled: this.config.sync_enabled,
        projects_count: this.config.projects.length,
        mcp_servers_count: this.config.mcp_servers.length,
        chittyauth: {
          healthy: authHealthy,
          endpoint: this.chittyAuthEndpoint,
          token_configured: !!this.authToken,
        },
        projects_dir: this.projectsDir,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const sync = new MCPProjectSync();

  const command = process.argv[2];

  switch (command) {
    case "start":
      console.log("Starting MCP Project Sync...");
      sync.startPeriodicSync();
      break;

    case "register": {
      const projectName = process.argv[3];
      if (!projectName) {
        console.error(
          "Project name required: node mcp-project-sync.js register <project-name>",
        );
        process.exit(1);
      }

      sync
        .registerProject({
          name: projectName,
          description: `MCP project: ${projectName}`,
          session_id: process.env.CLAUDE_SESSION_ID || `session-${Date.now()}`,
          capabilities: ["chittyid", "langchain", "chittycases"],
          mcp_servers: sync.config.mcp_servers,
        })
        .then((result) => {
          console.log(JSON.stringify(result, null, 2));
        });
      break;
    }

    case "health":
      sync.healthCheck().then((result) => {
        console.log(JSON.stringify(result, null, 2));
      });
      break;

    case "servers": {
      const projectId = process.argv[3];
      if (!projectId) {
        console.error(
          "Project ID required: node mcp-project-sync.js servers <project-id>",
        );
        process.exit(1);
      }

      sync.startMCPServers(projectId).then((servers) => {
        console.log(
          `Started ${servers.length} MCP servers for project ${projectId}`,
        );
        console.log(JSON.stringify(servers, null, 2));
      });
      break;
    }

    default:
      console.log(`
MCP Project Sync Commands:
  start                     - Start periodic sync with ChittyAuth
  register <project-name>   - Register new MCP project
  health                    - Check system health
  servers <project-id>      - Start MCP servers for project

Environment Variables:
  CHITTY_AUTH_TOKEN        - ChittyAuth authentication token
  CHITTYAUTH_ENDPOINT      - ChittyAuth service endpoint
  CHITTY_API_KEY          - ChittyID API key
  OPENAI_API_KEY          - OpenAI API key
  ANTHROPIC_API_KEY       - Anthropic API key
`);
  }
}

export { MCPProjectSync };
