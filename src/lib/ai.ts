import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY!,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

const MODEL = "abacusai/dracarys-llama-3.1-70b-instruct";

const PROMPT_PREFIX = `You are summarizing an Indian Government Order (GO) for a public information system.
Summarize the following Government Order text in 2-3 sentences. Cover: the key decision or directive, the departments or beneficiaries affected, and the effective date if mentioned. Be concise and factual.

GO TEXT:
`;

const MAX_PDF_CHARS = 30_000;
const AI_TIMEOUT_MS = 120_000; // 2 minutes

export async function generateGOOverview(pdfText: string): Promise<string> {
  const truncated = pdfText.slice(0, MAX_PDF_CHARS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const completion = await client.chat.completions.create(
      {
        model: MODEL,
        messages: [{ role: "user", content: `${PROMPT_PREFIX}${truncated}` }],
        temperature: 0.3,
        max_tokens: 256,
        stream: false,
      },
      { signal: controller.signal },
    );
    return (completion.choices[0]?.message?.content ?? "").trim();
  } catch (err) {
    throw new Error(`AI overview generation failed: ${err}`);
  } finally {
    clearTimeout(timer);
  }
}
