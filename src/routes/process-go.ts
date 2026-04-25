import {
  handleCallback,
  MessageNotFoundError,
  MessageNotAvailableError,
} from "@vercel/queue";
import { extractPDFText } from "../lib/pdf.js";
import { generateGOOverview } from "../lib/ai.js";
import { getGO, setGO, addGOToIndex, incrementJobDone } from "../lib/cache.js";
import { rawGOToPartial } from "../lib/scraper.js";
import type { ProcessGOMessage } from "./scrape.js";
import type { GO } from "../types.js";

const MAX_DELIVERY_ATTEMPTS = 3;

// Vercel Queue push-mode consumer for the "go-processing" topic.
// Vercel invokes this route directly — it has no public URL.
export const POST = handleCallback<ProcessGOMessage>(
  async (data, metadata) => {
    const { jobId, raw, goId } = data;
    console.log(
      `[process-go] Starting: ${goId} (delivery #${metadata.deliveryCount})`,
    );

    // Idempotency — skip if already cached (handles re-deliveries gracefully)
    const existing = await getGO(goId);
    if (existing) {
      console.log(`[process-go] Already cached, skipping: ${goId}`);
      return;
    }

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
  },
  {
    retry(err, metadata) {
      // Message already gone (acknowledged by a previous delivery or expired) — stop retrying
      if (
        err instanceof MessageNotFoundError ||
        err instanceof MessageNotAvailableError
      ) {
        console.log(
          `[process-go] Message no longer available (${err.constructor.name}), acknowledging: ${metadata.messageId}`,
        );
        return { acknowledge: true };
      }

      const attempt = metadata.deliveryCount;
      console.error(`[process-go] Error on attempt ${attempt}:`, String(err));

      if (attempt >= MAX_DELIVERY_ATTEMPTS) {
        console.error(
          `[process-go] Max retries reached, dropping: ${metadata.messageId}`,
        );
        return { acknowledge: true };
      }

      // Exponential backoff: 10s → 30s
      const delaySeconds = 10 * attempt;
      console.log(
        `[process-go] Retrying in ${delaySeconds}s (attempt ${attempt}/${MAX_DELIVERY_ATTEMPTS})`,
      );
      return { afterSeconds: delaySeconds };
    },
  },
);
