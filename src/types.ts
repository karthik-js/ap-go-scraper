export interface GO {
  id: string;          // unique slug: e.g. "2024-go-ms42"
  year: string;
  title: string;
  description: string;
  pdfUrl: string;
  aiOverview: string;  // 2-3 sentence summary generated from PDF text
  pdfText?: string;    // cached extracted PDF text for chat (set on first question)
  status: "pending" | "done" | "failed";
  scrapedAt: string;   // ISO 8601 timestamp
}

export interface ScrapeResult {
  added: GO[];
  skipped: number;
  errors: string[];
}
