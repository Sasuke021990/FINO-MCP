import { z } from 'zod';

const ColumnSchema = z.object({
    header: z.string(),
    // The model sometimes emits figures as JSON numbers instead of quoted strings; coerce rather than reject.
    data: z.array(z.coerce.string())
});

const TableSchema = z.object({
    description: z.string(),
    columns: z.array(ColumnSchema)
});

const ProsConsSchema = z.object({
    pros: z.array(z.string()),
    cons: z.array(z.string())
});

const NewsSchema = z.object({
    items: z.array(z.object({
        date: z.string(),
        headline: z.string()
    }))
});

function tablePrompt(sectionTitle: string, example: string): string {
    return `You are an expert financial data extractor. I am providing you with a screenshot of a company's "${sectionTitle}" section from its financial profile.
Extract the tabular data from the image.
You must output strictly in JSON format matching this exact schema:
${example}
Do not include any other text, markdown blocks, or explanations outside the JSON object.`;
}

interface SectionConfig {
    key: string;
    schema: z.ZodTypeAny;
    prompt: string;
}

// Maps each screenshot filename (produced by screenshotTool.ts) to how it should be extracted.
// A filename with no entry here (e.g. BlogPosts_info.png) is skipped during extraction but
// remains available as a raw screenshot via the static file server.
export const SECTION_CONFIG: Record<string, SectionConfig> = {
    'Balance_info.png': {
        key: 'Balance Sheet',
        schema: TableSchema,
        prompt: tablePrompt('Balance Sheet', `{
  "description": "All Figures are in Crores. (or other unit if specified)",
  "columns": [
    { "header": "PARTICULARS", "data": ["ShareCapital", "Total Reserves", "Borrowings", "Other Liabilities", "Total Liabilities"] },
    { "header": "MAR 2022", "data": ["1,096.40", "53,254.30", "123.40", "56.70", "54,530.80"] }
  ]
}`)
    },
    'Profit_info.png': {
        key: 'Profit & Loss',
        schema: TableSchema,
        prompt: tablePrompt('Profit & Loss', `{
  "description": "All Figures are in Crores. (or other unit if specified)",
  "columns": [
    { "header": "PARTICULARS", "data": ["Sales", "Expenses", "Operating Profit", "Net Profit"] },
    { "header": "MAR 2022", "data": ["1,096.40", "534.30", "123.40", "56.70"] }
  ]
}`)
    },
    'Quarterly_info.png': {
        key: 'Quarterly Results',
        schema: TableSchema,
        prompt: tablePrompt('Quarterly Results', `{
  "description": "All Figures are in Crores.",
  "columns": [
    { "header": "PARTICULARS", "data": ["Sales", "Expenses", "Net Profit"] },
    { "header": "JUN 2024", "data": ["1,096.40", "534.30", "56.70"] }
  ]
}`)
    },
    'Peer_info.png': {
        key: 'Peer Comparison',
        schema: TableSchema,
        prompt: tablePrompt('Peer Comparison', `{
  "description": "Peer comparison metrics",
  "columns": [
    { "header": "Name", "data": ["Company A", "Company B"] },
    { "header": "CMP Rs.", "data": ["123.40", "456.70"] }
  ]
}`)
    },
    'ShareHolding_info.png': {
        key: 'Shareholding Pattern',
        schema: TableSchema,
        prompt: tablePrompt('Shareholding Pattern', `{
  "description": "Shareholding percentage by category",
  "columns": [
    { "header": "Category", "data": ["Promoters", "FII", "DII", "Public"] },
    { "header": "Sep 2024", "data": ["45.0", "20.1", "10.2", "24.7"] }
  ]
}`)
    },
    'CorporateAction_info.png': {
        key: 'Corporate Actions',
        schema: TableSchema,
        prompt: tablePrompt('Corporate Actions', `{
  "description": "Bonus, split and other corporate actions",
  "columns": [
    { "header": "Date", "data": ["01-01-2022", "01-06-2023"] },
    { "header": "Action", "data": ["Bonus 1:1", "Split 1:5"] }
  ]
}`)
    },
    'DivContent_info.png': {
        key: 'Dividend',
        schema: TableSchema,
        prompt: tablePrompt('Dividend', `{
  "description": "Dividend history",
  "columns": [
    { "header": "Date", "data": ["01-01-2022", "01-06-2023"] },
    { "header": "Dividend %", "data": ["50", "60"] }
  ]
}`)
    },
    'ProsAndCons_info.png': {
        key: 'Pros and Cons',
        schema: ProsConsSchema,
        prompt: `You are an expert financial analyst. I am providing you with a screenshot listing the Pros and Cons of a company.
Extract the bullet points exactly as written.
You must output strictly in JSON format matching this exact schema:
{
  "pros": ["Company is almost debt free.", "Company has been maintaining a healthy dividend payout."],
  "cons": ["The company has delivered a poor sales growth.", "Promoter holding has decreased."]
}
Do not include any other text, markdown blocks, or explanations outside the JSON object.`
    },
    'CorpNews_info.png': {
        key: 'Corporate News',
        schema: NewsSchema,
        prompt: `You are an expert financial data extractor. I am providing you with a screenshot of recent Corporate News headlines for a company.
Extract each news item's date and headline.
You must output strictly in JSON format matching this exact schema:
{
  "items": [
    { "date": "01 Jan 2025", "headline": "Company announces quarterly results" }
  ]
}
Do not include any other text, markdown blocks, or explanations outside the JSON object.`
    }
};
