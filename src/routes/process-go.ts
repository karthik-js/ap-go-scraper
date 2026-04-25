import { handleCallback } from "@vercel/queue";
import { extractPDFText } from "../lib/pdf.js";
import { generateGOOverview } from "../lib/ai.js";
import { getGO, setGO, addGOToIndex, incrementJobDone, incrementJobFailed } from "../lib/cache.js";
import { rawGOToPartial } from "../lib/scraper.js";
import type { ProcessGOMessage } from "./scrape.js";
import type { GO } from "../types.js";

const MAX_DELIVERY_ATTEMPTS = 3;

// Vercel Queue push-mode consumer for the "go-processing" topic.
// Vercel invokes this route directly — it has no public URL.
export const POST = handleCallback<ProcessGOMessage>(async (data, metadata) => {
  const { jobId, raw, goId } = data;
  console.log(`[process-go] Starting: ${goId} (delivery #${metadata.deliveryCount}/${MAX_DELIVERY_ATTEMPTS})`);

  // Idempotency check — Vercel re-delivers if visibility timeout expires mid-processing.
  // If already cached, acknowledge and skip cleanly.
  const existing = await getGO(goId);
  if (existing) {
    console.log(`[process-go] Already cached, skipping: ${goId}`);
    return;
  }

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

    if (metadata.deliveryCount < MAX_DELIVERY_ATTEMPTS) {
      console.log(`[process-go] Retrying ${goId} (attempt ${metadata.deliveryCount}/${MAX_DELIVERY_ATTEMPTS})`);
      throw err;
    }

    console.error(`[process-go] Dropping ${goId} after ${MAX_DELIVERY_ATTEMPTS} failed attempts`);
  }
});
