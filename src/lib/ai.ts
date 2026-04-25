import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const model = google("gemini-2.5-flash");

const PROMPT_PREFIX = `You are summarizing an Indian Government Order (GO) for a public information system.
Summarize the following Government Order text in 2-3 sentences. Cover: the key decision or directive, the departments or beneficiaries affected, and the effective date if mentioned. Be concise and factual.

GO TEXT:
`;

export async function generateGOOverview(pdfText: string): Promise<string> {
  const truncated = pdfText.slice(0, 8000);

  const { text } = await generateText({
    model,
    prompt: `${PROMPT_PREFIX}${truncated}`,
  });

  return text.trim();
}
