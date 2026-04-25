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

function buildGOId(year: string, title: string): string {
  return `${slugify(year)}-${slugify(title)}`.slice(0, 100);
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
    await page.goto(GO_LIST_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);

    const title = await page.title();
    console.log(`[scraper] Page title: "${title}"`);

    const gos = await page.evaluate(() => {
      const BASE = "https://cag.gov.in";
      const results: Array<{
        year: string;
        title: string;
        description: string;
        pdfUrl: string;
      }> = [];

      // Each year is an h1.accTrigger, followed by .accordDetail with <ul><li><a>
      const accordions = document.querySelectorAll(".accordion.guidelinesList");
      accordions.forEach((accordion) => {
        const yearEl = accordion.querySelector("h1.accTrigger");
        const year = yearEl?.textContent?.trim() ?? "Unknown";

        accordion.querySelectorAll(".accordDetail a[href]").forEach((el) => {
          const a = el as HTMLAnchorElement;
          const linkTitle = a.textContent?.trim() ?? "";
          const href = a.getAttribute("href") ?? "";
          if (!href || !linkTitle) return;

          const pdfUrl = href.startsWith("http") ? href : `${BASE}${href}`;
          results.push({ year, title: linkTitle, description: linkTitle, pdfUrl });
        });
      });

      return results;
    });

    console.log(`[scraper] Done. Total GOs scraped: ${gos.length}`);
    return gos;
  } finally {
    await browser.close();
    console.log("[scraper] Browser closed");
  }
}

export function rawGOToPartial(raw: RawGO): Omit<GO, "aiOverview" | "scrapedAt"> {
  const id = buildGOId(raw.year, raw.title);
  return { id, ...raw };
}
