import { chromium } from 'playwright';
import { captureFinologyScreenshot } from './src/tools/screenshotTool.js';

(async () => {
    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });
    console.log("Capturing screenshots for HDFCBANK...");
    const files = await captureFinologyScreenshot(browser, 'HDFCBANK');
    console.log("Captured:", files);
    await browser.close();
    console.log("Done!");
})();
