import { Hono } from "hono";
import { send } from "@vercel/queue";
import { randomUUID } from "node:crypto";
import { scrapeGOList, rawGOToPartial } from "../lib/scraper.js";
import { getGO, setJobStatus, getJobStatus, flushAllGOs, checkScrapeRateLimit } from "../lib/cache.js";
import type { RawGO } from "../lib/scraper.js";

const scrapeRouter = new Hono();

export interface ProcessGOMessage {
  jobId: string;
  raw: RawGO;
  goId: string;
}

// ── Middleware: API key auth ───────────────────────────────────────────────────
scrapeRouter.use("/", async (c, next) => {
  const apiKey = process.env.SCRAPE_API_KEY;
  if (!apiKey) {
    console.error("[auth] SCRAPE_API_KEY env var not set");
    return c.json({ error: "Server misconfiguration" }, 500);
  }

  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (token !== apiKey) {
    console.warn("[auth] Unauthorized scrape attempt");
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

scrapeRouter.use("/flush", async (c, next) => {
  const apiKey = process.env.SCRAPE_API_KEY;
  if (!apiKey) return c.json({ error: "Server misconfiguration" }, 500);

  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (token !== apiKey) {
    console.warn("[auth] Unauthorized flush attempt");
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

// POST /api/scrape — scrapes GO list, queues each new GO for enrichment
scrapeRouter.post("/", async (c) => {
  const rateLimit = await checkScrapeRateLimit();
  if (!rateLimit.allowed) {
    console.warn(`[scrape] Rate limit exceeded. Resets in ${rateLimit.resetInSeconds}s`);
    return c.json(
      {
        error: "Rate limit exceeded. Max 3 scrapes per 24 hours.",
        resetInSeconds: rateLimit.resetInSeconds,
      },
      429,
    );
  }
  console.log(`[scrape] Rate limit OK — ${rateLimit.remaining} remaining in window`);
  console.log("[scrape] Starting GO list scrape...");
  let rawGOs: RawGO[];
  try {
    rawGOs = await scrapeGOList();
  } catch (err) {
    console.error("[scrape] Scraping failed:", err);
    return c.json({ error: "Scraping failed", detail: String(err) }, 500);
  }

  console.log(`[scrape] Found ${rawGOs.length} GOs on the page`);

  if (rawGOs.length === 0) {
    return c.json({ message: "No GOs found on the page" }, 200);
  }

  const jobId = randomUUID();
  let queued = 0;
  let skipped = 0;

  for (const raw of rawGOs) {
    const partial = rawGOToPartial(raw);
    const existing = await getGO(partial.id);
    if (existing) {
      console.log(`[scrape] Skipping cached GO: ${partial.id}`);
      skipped++;
      continue;
    }

    const message: ProcessGOMessage = { jobId, raw, goId: partial.id };
    await send("go-processing", message, {
      idempotencyKey: partial.id,
    });
    console.log(`[scrape] Queued GO: ${partial.id}`);
    queued++;
  }

  console.log(`[scrape] Job ${jobId} — queued: ${queued}, skipped: ${skipped}`);

  await setJobStatus({
    jobId,
    total: queued,
    done: 0,
    failed: 0,
    errors: [],
    startedAt: new Date().toISOString(),
  });

  return c.json({
    jobId,
    message: `Queued ${queued} new GOs for processing. ${skipped} already cached.`,
    queued,
    skipped,
    statusUrl: `/api/scrape/status/${jobId}`,
  });
});

// GET /api/scrape/status/:jobId — poll job progress
scrapeRouter.get("/status/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  console.log(`[scrape] Status check for job: ${jobId}`);
  const status = await getJobStatus(jobId);
  if (!status) {
    return c.json({ error: "Job not found" }, 404);
  }
  const pending = status.total - status.done - status.failed;
  return c.json({ ...status, pending, complete: pending === 0 });
});

// DELETE /api/scrape/flush — clears all cached GOs so next scrape reprocesses everything
scrapeRouter.delete("/flush", async (c) => {
  const count = await flushAllGOs();
  console.log(`[scrape] Flushed ${count} GOs from cache`);
  return c.json({ message: `Flushed ${count} GOs from cache. Run POST /api/scrape to re-scrape.`, flushed: count });
});

export default scrapeRouter;
