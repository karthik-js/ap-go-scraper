import { handleCallback } from "@vercel/queue";
import { extractPDFText } from "../lib/pdf.js";
import { generateGOOverview } from "../lib/ai.js";
import { setGO, addGOToIndex, incrementJobDone, incrementJobFailed } from "../lib/cache.js";
import { rawGOToPartial } from "../lib/scraper.js";
import type { ProcessGOMessage } from "./scrape.js";
import type { GO } from "../types.js";

// Vercel Queue push-mode consumer for the "go-processing" topic.
// Vercel invokes this route directly — it has no public URL.
export const POST = handleCallback<ProcessGOMessage>(async (data, metadata) => {
  const { jobId, raw, goId } = data;
  console.log(`[process-go] Starting: ${goId} (delivery #${metadata.deliveryCount})`);

  try {
    const partial = rawGOToPartial(raw);

    console.log(`[process-go] Fetching PDF: ${raw.pdfUrl}`);
    const pdfText = await extractPDFText(raw.pdfUrl);
    console.log(`[process-go] PDF extracted, ${pdfText.length} chars`);

    console.log(`[process-go] Generating AI overview for: ${goId}`);
    const aiOverview = await generateGOOverview(pdfText);
    console.log(`[process-go] AI overview done for: ${goId}`);

    const go: GO = {
      ...partial,
      aiOverview,
      scrapedAt: new Date().toISOString(),
    };

    await setGO(go);
    await addGOToIndex(go.id);
    await incrementJobDone(jobId);

    console.log(`[process-go] ✓ Cached: ${goId}`);
  } catch (err) {
    console.error(`[process-go] ✗ Failed: ${goId}`, err);
    await incrementJobFailed(jobId, `${goId}: ${String(err)}`);
    throw err;
  }
});
