import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { chromium, type Browser } from 'playwright';
import { screenshotToolSchema, captureFinologyScreenshot } from './tools/screenshotTool.js';
import express from 'express';
import path from 'path';
import { saveScreenshots, getScreenshots } from './db/sqlite.js';

const SCREENSHOT_BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:8888';
const REFRESH_ON_CACHE_HIT = ['Share_Price'];

class FinologyServer {
    private browser: Browser | null = null;
    private app: express.Application;
    private httpServer: any;

    constructor() {
        this.app = express();
        this.app.use(express.json());

        const screenshotsDir = path.join(process.cwd(), 'screenshots');
        // Serve the screenshots directory as static files
        this.app.use(express.static(screenshotsDir));

        // API Endpoint for a ticker's captured screenshots
        this.app.get('/api/screenshots/:ticker', (req, res) => {
            const ticker = req.params.ticker.toUpperCase();
            try {
                const data = getScreenshots(ticker);
                if (data.length > 0) {
                    res.json(data);
                } else {
                    res.status(404).json({ error: "No screenshots found for this ticker." });
                }
            } catch (error: any) {
                console.error(error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        this.setupMcpHttpRoute();

        process.on("SIGINT", async () => {
            await this.cleanup();
            process.exit(0);
        });

        process.on("SIGTERM", async () => {
            await this.cleanup();
            process.exit(0);
        });
    }

    private async setupBrowser() {
        if (!this.browser) {
            console.error("Launching persistent Playwright browser...");
            this.browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            console.error("Browser launched successfully.");
        }
    }

    // Builds a fresh MCP Server instance wired to the shared browser/DB.
    // The SDK forbids reconnecting one Server instance to more than one
    // transport, so stdio (at startup) and each HTTP request need their own.
    private createMcpServer(): Server {
        const server = new Server(
            {
                name: "finology-mcp-server",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [screenshotToolSchema],
        }));

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name !== screenshotToolSchema.name) {
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }

            const tickerSymbol = String(request.params.arguments?.tickerSymbol);
            if (!tickerSymbol) {
                throw new McpError(ErrorCode.InvalidParams, "tickerSymbol is required");
            }

            const tickerFolder = tickerSymbol.toUpperCase();

            try {
                // DB-first: if screenshots already exist for this ticker, only
                // refresh the fast-changing sections (e.g. Share_Price) and
                // serve the rest straight from the DB.
                const existing = getScreenshots(tickerFolder);
                const isCacheHit = existing.length > 0;
                const locatorsToCapture = isCacheHit ? REFRESH_ON_CACHE_HIT : undefined;

                // Ensure browser is ready
                await this.setupBrowser();

                if (!this.browser) {
                    throw new Error("Browser failed to initialize");
                }

                console.error(
                    isCacheHit
                        ? `Cache hit for ${tickerFolder}. Refreshing: ${REFRESH_ON_CACHE_HIT.join(', ')}`
                        : `No cached screenshots for ${tickerFolder}. Capturing all sections.`
                );

                if (isCacheHit) {
                    // Best-effort refresh: if it fails, serve the stale cached
                    // data instead of failing the whole call.
                    try {
                        const resultFiles = await captureFinologyScreenshot(this.browser, tickerSymbol, locatorsToCapture);
                        saveScreenshots(tickerFolder, resultFiles, SCREENSHOT_BASE_URL);
                    } catch (refreshError: any) {
                        console.error(`Refresh failed for ${tickerFolder}, serving stale cache:`, refreshError);
                    }
                    const screenshots = getScreenshots(tickerFolder);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Screenshots for ${tickerFolder}.\n\n${JSON.stringify(screenshots, null, 2)}`
                            }
                        ],
                    };
                }

                const resultFiles = await captureFinologyScreenshot(this.browser, tickerSymbol);
                console.error(`Screenshots captured successfully for ${tickerFolder}`);

                saveScreenshots(tickerFolder, resultFiles, SCREENSHOT_BASE_URL);
                const screenshots = getScreenshots(tickerFolder);

                return {
                    content: [
                        {
                            type: "text",
                            text: `Screenshots for ${tickerFolder}.\n\n${JSON.stringify(screenshots, null, 2)}`
                        }
                    ],
                };
            } catch (error: any) {
                console.error(`Screenshot capture failed:`, error);
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        });

        server.onerror = (error) => console.error("[MCP Error]", error);
        return server;
    }

    private setupMcpHttpRoute() {
        // Stateless mode: each request gets its own Server + transport, both
        // wired to the same shared browser/DB, then torn down when the
        // response closes. No session state is needed since every tool call
        // is self-contained given a tickerSymbol.
        this.app.post('/mcp', async (req, res) => {
            try {
                const mcpServer = this.createMcpServer();
                // Omitting sessionIdGenerator (rather than setting it to undefined)
                // is required for stateless mode under exactOptionalPropertyTypes.
                const transport = new StreamableHTTPServerTransport({});
                res.on('close', () => {
                    transport.close();
                    mcpServer.close();
                });
                // Cast needed: the SDK's own Transport/StreamableHTTPServerTransport
                // typings aren't exactOptionalPropertyTypes-clean (onclose/onerror are
                // typed as required on Transport but optional on the concrete class).
                await mcpServer.connect(transport as unknown as Parameters<typeof mcpServer.connect>[0]);
                await transport.handleRequest(req, res, req.body);
            } catch (error) {
                console.error('Error handling MCP request:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: '2.0',
                        error: { code: -32603, message: 'Internal server error' },
                        id: null
                    });
                }
            }
        });

        this.app.get('/mcp', (_req, res) => {
            res.writeHead(405).end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Method not allowed.' },
                id: null
            }));
        });

        this.app.delete('/mcp', (_req, res) => {
            res.writeHead(405).end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Method not allowed.' },
                id: null
            }));
        });
    }

    private async cleanup() {
        if (this.browser) {
            console.error("Closing browser...");
            await this.browser.close();
            this.browser = null;
        }
        if (this.httpServer) {
            this.httpServer.close();
        }
    }

    async run() {
        // Start express server (static screenshots + screenshots API + MCP over HTTP at /mcp)
        this.httpServer = this.app.listen(8888, () => {
            console.error("Express server running on http://localhost:8888 (MCP endpoint: POST /mcp)");
        });

        // Initialize browser upfront
        await this.setupBrowser();

        // Also keep stdio available for local/attached use
        const stdioServer = this.createMcpServer();
        const stdioTransport = new StdioServerTransport();
        await stdioServer.connect(stdioTransport);
        console.error("Finology MCP server running on stdio");
    }
}

const server = new FinologyServer();
server.run().catch(console.error);
