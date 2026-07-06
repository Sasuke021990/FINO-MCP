import { z } from 'zod';
import type { Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

export const screenshotToolSchema = {
    name: 'capture_finology_screenshot',
    description: 'Captures targeted screenshots of a company profile on Finology based on the ticker symbol.',
    inputSchema: {
        type: 'object',
        properties: {
            tickerSymbol: {
                type: 'string',
                description: 'The exact ticker symbol of the company (e.g., TCS, RELIANCE, INFY).'
            }
        },
        required: ['tickerSymbol']
    }
};

const LOCATORS = {
    'Peer_info': '#peer > div > div',
    'ShareHolding_info': '#mainContent_ShareHolding > div > div',
    'ProsAndCons_info': '#mainContent_ProsAndCons',
    'Quarterly_info': '#mainContent_quarterly',
    'Profit_info': '#profit > div > div',
    'Balance_info': '#balance > div > div',
    'CorporateAction_info': '#CorporateAction > div > div',
    'CorpNews_info': '#corpnews > div > div',
    'DivContent_info': '#mainContent_divContentTemp > div > div',
    'BlogPosts_info': '#BlogPosts'
};

export async function captureFinologyScreenshot(
    browser: Browser,
    tickerSymbol: string
): Promise<string[]> {
    const tickerFolder = tickerSymbol.toUpperCase();
    const screenshotsDir = path.join(process.cwd(), 'screenshots', tickerFolder);
    
    // Check cache
    if (fs.existsSync(screenshotsDir)) {
        const existingFiles = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'));
        if (existingFiles.length > 0) {
            console.error(`Cache hit for ${tickerFolder}. Found ${existingFiles.length} screenshots.`);
            return existingFiles;
        }
    } else {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    let page: Page | null = null;
    const capturedFiles: string[] = [];
    
    try {
        page = await browser.newPage();
        
        // Block unnecessary resources for speed and cleanliness
        await page.route('**/*', (route) => {
            const request = route.request();
            if (['image', 'media', 'font'].includes(request.resourceType())) {
                if (request.url().includes('google-analytics') || request.url().includes('googlesyndication') || request.url().includes('clarity')) {
                    route.abort();
                } else {
                    route.continue();
                }
            } else {
                route.continue();
            }
        });

        const url = `https://ticker.finology.in/company/${tickerFolder}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait a second for dynamic components to settle
        await page.waitForTimeout(2000);

        // Inject CSS to hide specific noisy sections
        await page.evaluate(() => {
            const style = document.createElement('style');
            style.innerHTML = `
                nav, footer, .bsnav, #footer { display: none !important; }
                .adsbygoogle, [id^="google_ads"], .sticky-top { display: none !important; }
            `;
            document.head.appendChild(style);
        });

        for (const [name, selector] of Object.entries(LOCATORS)) {
            try {
                const locator = page.locator(selector);
                // Wait for up to 3 seconds for the element to be visible
                await locator.waitFor({ state: 'visible', timeout: 3000 });
                
                const fileName = `${name}.png`;
                const filePath = path.join(screenshotsDir, fileName);
                
                await locator.screenshot({ path: filePath });
                capturedFiles.push(fileName);
                console.error(`Captured ${fileName} for ${tickerFolder}`);
            } catch (err) {
                console.error(`Skipping ${name} for ${tickerFolder}: Element not found or not visible.`);
            }
        }

        return capturedFiles;
        
    } catch (error) {
        console.error(`Error capturing screenshot for ${tickerSymbol}:`, error);
        throw error;
    } finally {
        if (page) {
            await page.close();
        }
    }
}
