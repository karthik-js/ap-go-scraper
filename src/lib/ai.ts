import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const model = google("gemini-2.5-flash");

const PROMPT_PREFIX = `You are summarizing an Indian Government Order (GO) for a public information system.
Summarize the following Government Order text in 2-3 sentences. Cover: the key decision or directive, the departments or beneficiaries affected, and the effective date if mentioned. Be concise and factual.

GO TEXT:
`;

// Truncate to 30k chars (~22k tokens) — large enough for big GOs, within Gemini limits
const MAX_PDF_CHARS = 30_000;
const AI_TIMEOUT_MS = 120_000; // 2 minutes

export async function generateGOOverview(pdfText: string): Promise<string> {
  const truncated = pdfText.slice(0, MAX_PDF_CHARS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const { text } = await generateText({
      model,
      prompt: `${PROMPT_PREFIX}${truncated}`,
      maxRetries: 2,
      abortSignal: controller.signal,
    });
    return text.trim();
  } catch (err) {
    throw new Error(`AI overview generation failed: ${err}`);
  } finally {
    clearTimeout(timer);
  }
}
