export interface GO {
  id: string;          // unique slug: e.g. "2024-go-ms42"
  year: string;
  title: string;
  description: string;
  pdfUrl: string;
  aiOverview: string;  // 2-3 sentence summary generated from PDF text
  status: "pending" | "done" | "failed";
  scrapedAt: string;   // ISO 8601 timestamp
}

export interface ScrapeResult {
  added: GO[];
  skipped: number;
  errors: string[];
}
