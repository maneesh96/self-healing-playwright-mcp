import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { HealingResult } from './healer';

export class SelfHealingMcpClient {
  private client: Client | null = null;
  private serverProcess: ChildProcess | null = null;

  private async initializeClient(): Promise<Client> {
    if (this.client) return this.client;

    console.log('[MCP Client] Initializing connection to local MCP Server...');

    // The server is written in TypeScript. We spawn it using ts-node to execute it directly.
    const serverPath = path.resolve(__dirname, 'mcpServer.ts');
    
    this.serverProcess = spawn('npx', ['ts-node', serverPath], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'inherit'], // Let stderr stream to standard error for clean logging
    });

    this.serverProcess.on('error', (err) => {
      console.error('[MCP Client] Failed to spawn MCP server process:', err);
    });

    const transport = new StdioClientTransport({
      input: this.serverProcess.stdout!,
      output: this.serverProcess.stdin!,
    });

    const client = new Client(
      {
        name: 'playwright-self-healing-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
    console.log('[MCP Client] Connected to MCP Server successfully');
    this.client = client;
    return this.client;
  }

  public async requestHealing(
    originalSelector: string,
    errorMessage: string,
    accessibilityTree: any,
    pageUrl: string
  ): Promise<HealingResult> {
    let client: Client;
    try {
      client = await this.initializeClient();
    } catch (err) {
      console.error('[MCP Client] Failed to establish connection to MCP Server. Falling back to inline healer.', err);
      // Fallback: If spawning child process fails, import HealerEngine directly and run it in-process.
      const { HealerEngine } = await import('./healer');
      return await HealerEngine.heal(originalSelector, errorMessage, accessibilityTree, pageUrl);
    }

    try {
      console.log('[MCP Client] Invoking "heal_locator" tool on MCP Server...');
      const response = await client.callTool({
        name: 'heal_locator',
        arguments: {
          originalSelector,
          errorMessage,
          accessibilityTree,
          pageUrl,
        },
      });

      if (response.isError) {
        throw new Error(`MCP Tool error: ${JSON.stringify(response.content)}`);
      }

      const contentText = response.content[0]?.type === 'text' ? response.content[0].text : '';
      if (!contentText) {
        throw new Error('MCP Tool returned an empty text response');
      }

      return JSON.parse(contentText) as HealingResult;
    } catch (error) {
      console.error('[MCP Client] MCP Server invocation failed, executing in-process recovery', error);
      const { HealerEngine } = await import('./healer');
      return await HealerEngine.heal(originalSelector, errorMessage, accessibilityTree, pageUrl);
    } finally {
      await this.shutdown();
    }
  }

  public async shutdown(): Promise<void> {
    if (this.client) {
      try {
        // Disconnecting client
        this.client = null;
      } catch (err) {
        // Ignore disconnect errors
      }
    }
    if (this.serverProcess) {
      try {
        this.serverProcess.kill('SIGTERM');
        this.serverProcess = null;
      } catch (err) {
        // Ignore kill errors
      }
    }
  }
}
