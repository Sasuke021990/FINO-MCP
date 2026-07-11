import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'financials.db');
const db = new Database(dbPath);

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    file_name TEXT NOT NULL,
    url TEXT NOT NULL,
    captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, file_name)
  )
`);

export interface ScreenshotRecord {
    fileName: string;
    url: string;
    capturedAt: string;
}

export function saveScreenshots(ticker: string, files: string[], baseUrl: string) {
    const stmt = db.prepare(`
        INSERT INTO screenshots (ticker, file_name, url, captured_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(ticker, file_name) DO UPDATE SET
        url = excluded.url,
        captured_at = CURRENT_TIMESTAMP
    `);
    const insertMany = db.transaction((fileNames: string[]) => {
        for (const fileName of fileNames) {
            stmt.run(ticker, fileName, `${baseUrl}/${ticker}/${fileName}`);
        }
    });
    insertMany(files);
}

export function getScreenshots(ticker: string): ScreenshotRecord[] {
    const stmt = db.prepare('SELECT file_name, url, captured_at FROM screenshots WHERE ticker = ? ORDER BY file_name');
    const rows = stmt.all(ticker) as { file_name: string; url: string; captured_at: string }[];
    return rows.map(row => ({ fileName: row.file_name, url: row.url, capturedAt: row.captured_at }));
}
