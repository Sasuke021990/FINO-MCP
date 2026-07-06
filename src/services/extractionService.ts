import fs from 'fs';
import path from 'path';
import { extractDataFromImage } from './ollamaService.js';
import { saveFinancialData, getFinancialData } from '../db/sqlite.js';
import { SECTION_CONFIG } from './extractionConfig.js';

const SCREENSHOT_BASE_URL = 'http://localhost:8888';

export async function processScreenshotExtraction(tickerSymbol: string, capturedFiles: string[]) {
    const tickerFolder = tickerSymbol.toUpperCase();
    const screenshotsDir = path.join(process.cwd(), 'screenshots', tickerFolder);

    // Start from whatever was already extracted, so a failure on one section
    // this run doesn't wipe out previously-extracted sections.
    const existing = getFinancialData(tickerFolder) ?? {};
    const result: Record<string, unknown> = { ...existing };

    // When the LLM can't be parsed into structured data, fall back to handing
    // back the raw screenshot so the caller still gets something usable.
    const useImageFallback = (fileName: string) => {
        result[SECTION_CONFIG[fileName]!.key] = {
            extractionFailed: true,
            imageUrl: `${SCREENSHOT_BASE_URL}/${tickerFolder}/${fileName}`
        };
        saveFinancialData(tickerFolder, JSON.stringify(result));
    };

    for (const fileName of capturedFiles) {
        const config = SECTION_CONFIG[fileName];
        if (!config) {
            // No extraction rule for this screenshot (e.g. BlogPosts_info.png) - skip it.
            continue;
        }

        try {
            const filePath = path.join(screenshotsDir, fileName);
            const imageBuffer = fs.readFileSync(filePath);
            const base64Image = imageBuffer.toString('base64');

            console.error(`Extracting "${config.key}" for ${tickerSymbol}...`);
            const rawJsonString = await extractDataFromImage(base64Image, config.prompt);

            let parsedData: unknown;
            try {
                parsedData = JSON.parse(rawJsonString);
            } catch (e) {
                console.error(`Failed to parse LLM response as JSON for ${tickerSymbol}/${config.key}, falling back to raw image:`, rawJsonString);
                useImageFallback(fileName);
                continue;
            }

            const validData = config.schema.safeParse(parsedData);
            if (!validData.success) {
                console.error(`Invalid JSON structure from LLM for ${tickerSymbol}/${config.key}, falling back to raw image:`, validData.error);
                useImageFallback(fileName);
                continue;
            }

            // Save immediately after each section is parsed, rather than batching
            // one save at the end - keeps already-extracted sections durable even
            // if a later screenshot in this run fails or the process is interrupted.
            result[config.key] = validData.data;
            saveFinancialData(tickerFolder, JSON.stringify(result));
            console.error(`Saved "${config.key}" for ${tickerSymbol}.`);
        } catch (error) {
            console.error(`Extraction failed for ${tickerSymbol}/${config.key}:`, error);
        }
    }

    console.error(`Finished extraction pass for ${tickerSymbol}. Sections saved: ${Object.keys(result).join(', ')}`);
}
