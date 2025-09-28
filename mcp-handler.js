#!/usr/bin/env node

/**
 * ChittyID MCP Tool Handler
 * Provides Model Context Protocol integration for ChittyID CLI
 *
 * This handler bridges the MCP protocol with the ChittyID CLI,
 * enforcing central service minting and validation only.
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

class ChittyIDMCPHandler {
  constructor() {
    this.manifest = this.loadManifest();
    this.cliPath = join(__dirname, 'chitty-cli.ts');
  }

  /**
   * Load MCP manifest
   */
  loadManifest() {
    try {
      const manifestPath = join(__dirname, 'manifest.json');
      return JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      throw new Error(`Failed to load manifest: ${error.message}`);
    }
  }

  /**
   * Handle MCP tool call
   */
  async handleToolCall(toolName, parameters) {
    if (toolName !== 'chittyid') {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Validate required parameters
    if (!parameters.command) {
      throw new Error('Command parameter is required');
    }

    // Validate command
    const validCommands = ['gen', 'generate', 'register', 'validate', 'soft-mint', 'hard-mint'];
    if (!validCommands.includes(parameters.command)) {
      throw new Error(`Invalid command: ${parameters.command}. Valid commands: ${validCommands.join(', ')}`);
    }

    // Build CLI arguments
    const args = [this.cliPath, parameters.command];

    // Add command-specific arguments
    switch (parameters.command) {
      case 'gen':
      case 'generate':
        if (parameters.type) args.push(parameters.type);
        break;

      case 'register':
        if (parameters.type) args.push(parameters.type);
        if (parameters.payload) args.push(parameters.payload);
        break;

      case 'validate':
        if (!parameters.id) {
          throw new Error('ID parameter is required for validate command');
        }
        args.push(parameters.id);
        break;

      case 'soft-mint':
        if (!parameters.id) {
          throw new Error('ID parameter is required for soft-mint command');
        }
        args.push(parameters.id);
        break;

      case 'hard-mint':
        if (!parameters.id) {
          throw new Error('ID parameter is required for hard-mint command');
        }
        args.push(parameters.id);
        if (parameters.maxGas) args.push(parameters.maxGas);
        break;
    }

    // Execute CLI command
    return this.executeCLI(args);
  }

  /**
   * Execute CLI command
   */
  async executeCLI(args) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      // Check required environment variables
      if (!process.env.CHITTY_API_KEY) {
        reject(new Error('CHITTY_API_KEY environment variable is required'));
        return;
      }

      const child = spawn('npx', ['tsx', ...args], {
        env: {
          ...process.env,
          CHITTY_BASE_URL: process.env.CHITTY_BASE_URL || 'https://id.chitty.cc',
          CHITTY_STORAGE: process.env.CHITTY_STORAGE || join(process.env.HOME || '.', '.chitty')
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        try {
          // Parse JSON output from CLI
          const result = JSON.parse(stdout);

          if (code === 0) {
            resolve({
              success: true,
              data: result,
              command: args[1],
              timestamp: new Date().toISOString()
            });
          } else {
            reject(new Error(`CLI command failed with code ${code}: ${stderr || result.error}`));
          }
        } catch (parseError) {
          if (code === 0) {
            // Non-JSON output but successful
            resolve({
              success: true,
              output: stdout,
              command: args[1],
              timestamp: new Date().toISOString()
            });
          } else {
            reject(new Error(`CLI command failed: ${stderr || stdout || 'Unknown error'}`));
          }
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute CLI: ${error.message}`));
      });
    });
  }

  /**
   * Get tool capabilities
   */
  getCapabilities() {
    return this.manifest.capabilities;
  }

  /**
   * Get tool documentation
   */
  getDocumentation() {
    return this.manifest.documentation;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test basic CLI availability
      const result = await this.executeCLI([this.cliPath]);
      return {
        healthy: true,
        cli_available: true,
        environment: {
          api_key_configured: !!process.env.CHITTY_API_KEY,
          base_url: process.env.CHITTY_BASE_URL || 'https://id.chitty.cc',
          storage_dir: process.env.CHITTY_STORAGE || join(process.env.HOME || '.', '.chitty')
        },
        manifest_version: this.manifest.version,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// MCP Protocol Handler
class MCPServer {
  constructor() {
    this.handler = new ChittyIDMCPHandler();
  }

  async processMessage(message) {
    try {
      const { method, params } = message;

      switch (method) {
        case 'tools/list':
          return {
            tools: [
              {
                name: 'chittyid',
                description: this.handler.manifest.description,
                inputSchema: this.handler.manifest.capabilities.tools.chittyid.inputSchema
              }
            ]
          };

        case 'tools/call':
          const { name, arguments: args } = params;
          const result = await this.handler.handleToolCall(name, args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };

        case 'ping':
          return { pong: true };

        case 'health':
          return await this.handler.healthCheck();

        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (error) {
      throw {
        code: -1,
        message: error.message,
        data: { timestamp: new Date().toISOString() }
      };
    }
  }

  start() {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      method: 'server/ready',
      params: {
        name: this.handler.manifest.name,
        version: this.handler.manifest.version,
        capabilities: this.handler.getCapabilities()
      }
    }));

    // Handle stdin messages
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (data) => {
      try {
        const lines = data.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            const message = JSON.parse(line);
            const response = await this.processMessage(message);

            console.log(JSON.stringify({
              jsonrpc: '2.0',
              id: message.id,
              result: response
            }));
          }
        }
      } catch (error) {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -1,
            message: error.message
          }
        }));
      }
    });
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MCPServer();
  server.start();
}

export { ChittyIDMCPHandler, MCPServer };