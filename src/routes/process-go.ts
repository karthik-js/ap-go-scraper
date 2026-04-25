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

  try {
    const partial = rawGOToPartial(raw);
    const pdfText = await extractPDFText(raw.pdfUrl);
    const aiOverview = await generateGOOverview(pdfText);

    const go: GO = {
      ...partial,
      aiOverview,
      scrapedAt: new Date().toISOString(),
    };

    await setGO(go);
    await addGOToIndex(go.id);
    await incrementJobDone(jobId);

    console.log(`[process-go] Done: ${goId} (delivery #${metadata.deliveryCount})`);
  } catch (err) {
    await incrementJobFailed(jobId, `${goId}: ${String(err)}`);
    // Re-throw so Vercel Queue retries the message
    throw err;
  }
});
