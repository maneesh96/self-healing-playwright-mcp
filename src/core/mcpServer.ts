import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { HealerEngine } from './healer';

class SelfHealingMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'playwright-self-healing-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
  }

  private setupTools() {
    // List tools available on this server
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'heal_locator',
            description: 'Analyzes a failed Playwright locator using accessibility tree structure and returns a resilient fallback locator',
            inputSchema: {
              type: 'object',
              properties: {
                originalSelector: {
                  type: 'string',
                  description: 'The broken selector that timed out during execution',
                },
                errorMessage: {
                  type: 'string',
                  description: 'The specific Playwright error/timeout message',
                },
                accessibilityTree: {
                  type: 'object',
                  description: 'The JSON accessibility tree of the page where the failure occurred',
                },
                pageUrl: {
                  type: 'string',
                  description: 'The current URL of the page',
                },
              },
              required: ['originalSelector', 'errorMessage', 'accessibilityTree', 'pageUrl'],
            },
          },
        ],
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'heal_locator') {
        throw new Error(`Tool not found: ${request.params.name}`);
      }

      const { originalSelector, errorMessage, accessibilityTree, pageUrl } = request.params.arguments as {
        originalSelector: string;
        errorMessage: string;
        accessibilityTree: any;
        pageUrl: string;
      };

      try {
        const result = await HealerEngine.heal(originalSelector, errorMessage, accessibilityTree, pageUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Healing failed: ${error?.message || error}`,
            },
          ],
        };
      }
    });
  }

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP Server] Connected to Stdio Transport');
  }
}

// If executed directly, run the server
if (require.main === module) {
  const mcpServer = new SelfHealingMcpServer();
  mcpServer.start().catch((err) => {
    console.error('[MCP Server Error] Critical crash during start:', err);
    process.exit(1);
  });
}
