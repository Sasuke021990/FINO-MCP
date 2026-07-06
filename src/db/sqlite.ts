import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'financials.db');
const db = new Database(dbPath);

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS financial_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export function saveFinancialData(ticker: string, data: string) {
    const stmt = db.prepare(`
        INSERT INTO financial_data (ticker, data, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(ticker) DO UPDATE SET 
        data = excluded.data,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(ticker, data);
}

export function getFinancialData(ticker: string): any {
    const stmt = db.prepare('SELECT data FROM financial_data WHERE ticker = ?');
    const row: any = stmt.get(ticker);
    return row ? JSON.parse(row.data) : null;
}
