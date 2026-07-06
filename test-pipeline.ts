import { chromium } from 'playwright';
import { captureFinologyScreenshot } from './src/tools/screenshotTool.js';
import { processScreenshotExtraction } from './src/services/extractionService.js';
import { getFinancialData } from './src/db/sqlite.js';

(async () => {
    try {
        console.log("1. Launching browser...");
        const browser = await chromium.launch({ headless: true });

        const ticker = 'RPOWER';
        console.log(`2. Capturing screenshots for ${ticker}...`);
        const files = await captureFinologyScreenshot(browser, ticker);
        console.log("Captured:", files);

        console.log("3. Triggering Ollama Extraction pipeline...");
        // Await this to ensure it finishes before we check the DB in this test script
        await processScreenshotExtraction(ticker, files);

        console.log("4. Fetching saved data from SQLite DB...");
        const data = getFinancialData(ticker);
        console.log("\n--- EXTRACTED DATA ---");
        console.log(JSON.stringify(data, null, 2));

        await browser.close();
        console.log("\n✅ Pipeline Test Completed Successfully!");
    } catch (error) {
        console.error("❌ Test Failed:", error);
        process.exit(1);
    }
})();
