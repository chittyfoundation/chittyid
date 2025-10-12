#!/usr/bin/env node

/**
 * Demo MCP Project Sync
 * Demonstrates MCP project synchronization with ChittyAuth integration
 * Shows local project management with simulated remote sync
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

class DemoMCPProjectSync {
  constructor() {
    this.projectsDir = join(__dirname, ".demo-projects");
    this.configFile = join(__dirname, "demo-mcp-config.json");

    // Ensure demo directories exist
    if (!existsSync(this.projectsDir)) {
      mkdirSync(this.projectsDir, { recursive: true });
    }

    this.config = this.loadConfig();
  }

  loadConfig() {
    if (existsSync(this.configFile)) {
      try {
        return JSON.parse(readFileSync(this.configFile, "utf8"));
      } catch (error) {
        console.error("Failed to load config:", error);
      }
    }

    // Default demo configuration
    const defaultConfig = {
      version: "1.0.0",
      demo_mode: true,
      sync_enabled: true,
      projects: [],
      auth_integration: {
        enabled: true,
        provider: "chittyauth",
        session_validation: true,
        cross_session_sync: true,
        demo_mode: true,
      },
      mcp_servers: [
        {
          name: "chittyid-mcp",
          executable: "node",
          args: ["mcp-handler.js"],
          status: "ready",
          capabilities: [
            "chittyid",
            "ai_legal_analysis",
            "ai_fund_tracing",
            "ai_document_generation",
            "ai_evidence_compilation",
            "ai_timeline_generation",
            "ai_compliance_analysis",
            "cases_legal_research",
            "cases_document_analysis",
            "cases_case_insights",
            "cases_petition_generation",
            "cases_contradiction_analysis",
            "cases_dashboard_generation",
          ],
        },
      ],
    };

    this.saveConfig(defaultConfig);
    return defaultConfig;
  }

  saveConfig(config = this.config) {
    try {
      writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }

  /**
   * Demo authentication with ChittyAuth
   */
  async demoAuthenticate(sessionId) {
    console.log(`[DEMO] Authenticating session: ${sessionId}`);

    // Simulate authentication delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Demo always succeeds
    return {
      valid: true,
      session_id: sessionId,
      authenticated_at: new Date().toISOString(),
      demo_mode: true,
    };
  }

  /**
   * Register MCP project (demo mode)
   */
  async registerProject(projectConfig) {
    const projectId = projectConfig.id || `mcp-demo-${Date.now()}`;

    console.log(`[DEMO] Registering MCP project: ${projectConfig.name}`);

    try {
      // Demo authentication
      const authResult = await this.demoAuthenticate(projectConfig.session_id);
      console.log(`[DEMO] Authentication result:`, authResult);

      // Create project record
      const project = {
        id: projectId,
        name: projectConfig.name,
        description: projectConfig.description,
        capabilities: projectConfig.capabilities,
        mcp_servers: this.config.mcp_servers,
        registered_at: new Date().toISOString(),
        demo_mode: true,
        chittyauth_integration: {
          enabled: true,
          session_id: projectConfig.session_id,
          authenticated: true,
        },
        state: {
          tools_available: this.config.mcp_servers[0].capabilities,
          last_sync: new Date().toISOString(),
          session_data: {
            active: true,
            projects_synced: 1,
          },
        },
      };

      // Save project locally
      const projectFile = join(this.projectsDir, `${projectId}.json`);
      writeFileSync(projectFile, JSON.stringify(project, null, 2));

      // Update config
      this.config.projects.push({
        id: projectId,
        name: projectConfig.name,
        registered_at: project.registered_at,
        demo_mode: true,
      });

      this.saveConfig();

      console.log(`[DEMO] Project registered successfully`);
      console.log(`[DEMO] Project ID: ${projectId}`);
      console.log(
        `[DEMO] Available tools: ${project.state.tools_available.length}`,
      );

      return {
        success: true,
        project_id: projectId,
        message: "Demo project registered successfully",
        chittyauth_integration: project.chittyauth_integration,
        tools_available: project.state.tools_available,
        demo_mode: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        demo_mode: true,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Start MCP servers (demo mode)
   */
  async startMCPServers(projectId) {
    const projectFile = join(this.projectsDir, `${projectId}.json`);

    if (!existsSync(projectFile)) {
      throw new Error(`Demo project ${projectId} not found`);
    }

    const project = JSON.parse(readFileSync(projectFile, "utf8"));

    console.log(`[DEMO] Starting MCP servers for project: ${project.name}`);

    const servers = [];

    for (const serverConfig of this.config.mcp_servers) {
      const demoServer = {
        name: serverConfig.name,
        pid: Math.floor(Math.random() * 10000) + 1000, // Demo PID
        status: "running",
        capabilities: serverConfig.capabilities,
        started_at: new Date().toISOString(),
        demo_mode: true,
        endpoints: {
          tools_list: `/mcp/${serverConfig.name}/tools/list`,
          tools_call: `/mcp/${serverConfig.name}/tools/call`,
          health: `/mcp/${serverConfig.name}/health`,
        },
      };

      servers.push(demoServer);
      console.log(
        `[DEMO] Started MCP server: ${serverConfig.name} (Demo PID: ${demoServer.pid})`,
      );
    }

    // Update project state
    project.state.mcp_servers = servers;
    project.state.last_sync = new Date().toISOString();
    writeFileSync(projectFile, JSON.stringify(project, null, 2));

    return servers;
  }

  /**
   * Simulate project sync with ChittyAuth
   */
  async syncProjectState(projectId) {
    const projectFile = join(this.projectsDir, `${projectId}.json`);

    if (!existsSync(projectFile)) {
      throw new Error(`Demo project ${projectId} not found`);
    }

    const project = JSON.parse(readFileSync(projectFile, "utf8"));

    console.log(`[DEMO] Syncing project state for: ${project.name}`);

    // Simulate sync delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Update project state
    project.state.last_sync = new Date().toISOString();
    project.state.sync_count = (project.state.sync_count || 0) + 1;
    project.state.session_data.last_activity = new Date().toISOString();

    writeFileSync(projectFile, JSON.stringify(project, null, 2));

    console.log(`[DEMO] Project state synced successfully`);
    console.log(`[DEMO] Sync count: ${project.state.sync_count}`);

    return {
      synced: true,
      project_id: projectId,
      sync_count: project.state.sync_count,
      last_sync: project.state.last_sync,
      demo_mode: true,
    };
  }

  /**
   * List all demo projects
   */
  listProjects() {
    console.log(`[DEMO] MCP Projects (${this.config.projects.length} total):`);
    console.log("=====================================");

    for (const project of this.config.projects) {
      const projectFile = join(this.projectsDir, `${project.id}.json`);

      if (existsSync(projectFile)) {
        const projectData = JSON.parse(readFileSync(projectFile, "utf8"));

        console.log(`\nProject: ${project.name}`);
        console.log(`ID: ${project.id}`);
        console.log(`Registered: ${project.registered_at}`);
        console.log(
          `Tools Available: ${projectData.state?.tools_available?.length || 0}`,
        );
        console.log(`Last Sync: ${projectData.state?.last_sync || "Never"}`);
        console.log(
          `ChittyAuth: ${projectData.chittyauth_integration?.enabled ? "Enabled" : "Disabled"}`,
        );
      }
    }

    if (this.config.projects.length === 0) {
      console.log(
        "No projects registered. Use 'register <project-name>' to create one.",
      );
    }
  }

  /**
   * Demo health check
   */
  async healthCheck() {
    return {
      healthy: true,
      demo_mode: true,
      mcp_sync_version: this.config.version,
      sync_enabled: this.config.sync_enabled,
      projects_count: this.config.projects.length,
      mcp_servers_count: this.config.mcp_servers.length,
      chittyauth: {
        healthy: true,
        demo_mode: true,
        endpoint: "demo://chittyauth-local",
        integration_enabled: true,
      },
      capabilities: {
        chittyid_tools: [
          "gen",
          "validate",
          "register",
          "soft-mint",
          "hard-mint",
        ],
        ai_services: [
          "legal_analysis",
          "fund_tracing",
          "document_generation",
          "evidence_compilation",
          "timeline_generation",
          "compliance_analysis",
        ],
        chittycases_tools: [
          "legal_research",
          "document_analysis",
          "case_insights",
          "petition_generation",
          "contradiction_analysis",
          "dashboard_generation",
        ],
      },
      projects_dir: this.projectsDir,
      timestamp: new Date().toISOString(),
    };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const demoSync = new DemoMCPProjectSync();
  const command = process.argv[2];

  switch (command) {
    case "register": {
      const projectName = process.argv[3];
      if (!projectName) {
        console.error(
          "Project name required: node demo-mcp-sync.js register <project-name>",
        );
        process.exit(1);
      }

      demoSync
        .registerProject({
          name: projectName,
          description: `Demo MCP project: ${projectName}`,
          session_id:
            process.env.CLAUDE_SESSION_ID || `demo-session-${Date.now()}`,
          capabilities: ["chittyid", "langchain-ai", "chittycases"],
        })
        .then((result) => {
          console.log("\n[RESULT]");
          console.log(JSON.stringify(result, null, 2));
        });
      break;
    }

    case "servers": {
      const projectId = process.argv[3];
      if (!projectId) {
        console.error(
          "Project ID required: node demo-mcp-sync.js servers <project-id>",
        );
        process.exit(1);
      }

      demoSync.startMCPServers(projectId).then((servers) => {
        console.log(`\n[RESULT] Started ${servers.length} demo MCP servers`);
        console.log(JSON.stringify(servers, null, 2));
      });
      break;
    }

    case "sync": {
      const syncProjectId = process.argv[3];
      if (!syncProjectId) {
        console.error(
          "Project ID required: node demo-mcp-sync.js sync <project-id>",
        );
        process.exit(1);
      }

      demoSync.syncProjectState(syncProjectId).then((result) => {
        console.log("\n[RESULT]");
        console.log(JSON.stringify(result, null, 2));
      });
      break;
    }

    case "list":
      demoSync.listProjects();
      break;

    case "health":
      demoSync.healthCheck().then((result) => {
        console.log(JSON.stringify(result, null, 2));
      });
      break;

    default:
      console.log(`
Demo MCP Project Sync Commands:
  register <project-name>   - Register new demo MCP project
  servers <project-id>      - Start demo MCP servers for project
  sync <project-id>         - Sync project state with ChittyAuth
  list                      - List all registered projects
  health                    - Check system health

Demo Features:
  • ChittyID tools integration (gen, validate, register, mint)
  • LangChain AI services (legal analysis, document generation, etc.)
  • ChittyCases integration (legal research, case insights, etc.)
  • ChittyAuth session management simulation
  • Cross-session project state persistence

Example Usage:
  node demo-mcp-sync.js register "chittyid-foundation"
  node demo-mcp-sync.js servers mcp-demo-1234567890
  node demo-mcp-sync.js sync mcp-demo-1234567890
  node demo-mcp-sync.js list
`);
  }
}

export { DemoMCPProjectSync };
