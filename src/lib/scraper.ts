import { chromium } from "playwright-core";
import type { GO } from "../types.js";

const GO_LIST_URL =
  "https://cag.gov.in/ae/andhra-pradesh/en/page-ae-andhra-pradesh-andhra-pradesh-go-s";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function buildGOId(department: string, year: string, title: string): string {
  return `${slugify(department)}-${slugify(year)}-${slugify(title)}`.slice(0, 100);
}

async function getBrowser() {
  // On Vercel (Lambda), use @sparticuz/chromium binary
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromiumPkg = await import("@sparticuz/chromium");
    return chromium.launch({
      args: chromiumPkg.default.args,
      executablePath: await chromiumPkg.default.executablePath(),
      headless: true,
    });
  }

  // Locally: use PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if set, else system Chromium
  return chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    channel: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? undefined : "chrome",
  });
}

export interface RawGO {
  department: string;
  year: string;
  title: string;
  description: string;
  pdfUrl: string;
}

export async function scrapeGOList(): Promise<RawGO[]> {
  console.log("[scraper] Launching browser...");
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    console.log(`[scraper] Navigating to: ${GO_LIST_URL}`);
    await page.goto(GO_LIST_URL, { waitUntil: "networkidle", timeout: 30000 });

    await page.waitForSelector("table, .go-list, .views-table, .view-content", {
      timeout: 15000,
    });
    console.log("[scraper] Page loaded, extracting GOs...");

    const gos: RawGO[] = [];
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
      console.log(`[scraper] Scraping page ${pageNum}...`);
      const pageGOs = await page.evaluate(() => {
        const rows: Array<{
          department: string;
          year: string;
          title: string;
          description: string;
          pdfUrl: string;
        }> = [];

        // Try table rows first
        const tableRows = document.querySelectorAll("table tbody tr");
        if (tableRows.length > 0) {
          tableRows.forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 2) return;

            const linkEl = row.querySelector("a[href$='.pdf'], a[href*='/uploads/']");
            const pdfUrl = linkEl ? (linkEl as HTMLAnchorElement).href : "";
            if (!pdfUrl) return;

            rows.push({
              department: cells[0]?.textContent?.trim() ?? "",
              year: cells[1]?.textContent?.trim() ?? "",
              title: cells[2]?.textContent?.trim() ?? cells[1]?.textContent?.trim() ?? "",
              description: cells[3]?.textContent?.trim() ?? "",
              pdfUrl,
            });
          });
        }

        // Fallback: generic view-row items with PDF links
        if (rows.length === 0) {
          const items = document.querySelectorAll(".views-row, .view-row, .go-item");
          items.forEach((item) => {
            const linkEl = item.querySelector("a[href$='.pdf'], a[href*='/uploads/']");
            const pdfUrl = linkEl ? (linkEl as HTMLAnchorElement).href : "";
            if (!pdfUrl) return;

            const texts = Array.from(item.querySelectorAll("span, td, div, p"))
              .map((el) => el.textContent?.trim())
              .filter(Boolean);

            rows.push({
              department: texts[0] ?? "",
              year: texts[1] ?? "",
              title: texts[2] ?? linkEl?.textContent?.trim() ?? "",
              description: texts[3] ?? "",
              pdfUrl,
            });
          });
        }

        return rows;
      });

      gos.push(...pageGOs);
      console.log(`[scraper] Page ${pageNum}: found ${pageGOs.length} GOs (total: ${gos.length})`);

      const nextLink = await page.$("a.next, a[title='Go to next page'], li.next a, .pager-next a");
      if (nextLink) {
        pageNum++;
        await nextLink.click();
        await page.waitForLoadState("networkidle");
      } else {
        hasNextPage = false;
      }
    }

    console.log(`[scraper] Done. Total GOs scraped: ${gos.length}`);
    return gos;
  } finally {
    await browser.close();
    console.log("[scraper] Browser closed");
  }
}

export function rawGOToPartial(raw: RawGO): Omit<GO, "aiOverview" | "scrapedAt"> {
  const id = buildGOId(raw.department, raw.year, raw.title);
  return { id, ...raw };
}
