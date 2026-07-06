import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { chromium, type Browser } from 'playwright';
import { screenshotToolSchema, captureFinologyScreenshot } from './tools/screenshotTool.js';
import express from 'express';
import path from 'path';
import { processScreenshotExtraction } from './services/extractionService.js';
import { getFinancialData } from './db/sqlite.js';

class FinologyServer {
    private server: Server;
    private browser: Browser | null = null;
    private app: express.Application;
    private httpServer: any;

    constructor() {
        this.server = new Server(
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

        this.app = express();
        const screenshotsDir = path.join(process.cwd(), 'screenshots');
        // Serve the screenshots directory as static files
        this.app.use(express.static(screenshotsDir));

        // API Endpoint for extracted financial data
        this.app.get('/api/financials/:ticker', (req, res) => {
            const ticker = req.params.ticker.toUpperCase();
            try {
                const data = getFinancialData(ticker);
                if (data) {
                    res.json(data);
                } else {
                    res.status(404).json({ error: "Financial data not found or still extracting." });
                }
            } catch (error: any) {
                console.error(error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        this.setupToolHandlers();
        
        this.server.onerror = (error) => console.error("[MCP Error]", error);
        
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

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [screenshotToolSchema],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name !== screenshotToolSchema.name) {
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }

            const tickerSymbol = String(request.params.arguments?.tickerSymbol);
            if (!tickerSymbol) {
                throw new McpError(ErrorCode.InvalidParams, "tickerSymbol is required");
            }

            const tickerFolder = tickerSymbol.toUpperCase();

            try {
                // DB-first: if we already have extracted financial data for this
                // ticker, return it immediately without touching the browser/LLM.
                const cachedData = getFinancialData(tickerFolder);
                if (cachedData) {
                    console.error(`DB cache hit for ${tickerFolder}. Returning immediately.`);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Returning cached financial data for ${tickerFolder}.\n\n${JSON.stringify(cachedData, null, 2)}`
                            }
                        ],
                    };
                }

                // Ensure browser is ready
                await this.setupBrowser();

                if (!this.browser) {
                    throw new Error("Browser failed to initialize");
                }

                console.error(`Capturing screenshot for ${tickerSymbol}...`);
                const resultFiles = await captureFinologyScreenshot(this.browser, tickerSymbol);
                console.error(`Screenshots captured successfully for ${tickerFolder}`);

                // Wait for extraction to finish so the tool always returns the
                // structured data itself, regardless of cache state.
                await processScreenshotExtraction(tickerSymbol, resultFiles);

                const freshData = getFinancialData(tickerFolder) ?? {};

                return {
                    content: [
                        {
                            type: "text",
                            text: `Fetched and extracted financial data for ${tickerFolder}.\n\n${JSON.stringify(freshData, null, 2)}`
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
        await this.server.close();
    }

    async run() {
        // Start express server
        this.httpServer = this.app.listen(8888, () => {
            console.error("Express static server running on http://localhost:8888");
        });

        // Initialize browser upfront
        await this.setupBrowser();

        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Finology MCP server running on stdio");
    }
}

const server = new FinologyServer();
server.run().catch(console.error);
