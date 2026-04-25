import { Hono } from "hono";
import { streamText } from "hono/streaming";
import OpenAI from "openai";
import { getGO, setGO, checkChatRateLimit } from "../lib/cache.js";
import { extractPDFText } from "../lib/pdf.js";

const chatRouter = new Hono();

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY!,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

const SYSTEM_PROMPT = `You are an assistant helping citizens understand Indian Government Orders (GOs) issued by Andhra Pradesh. 
Answer questions clearly and concisely based only on the provided GO document. 
If the answer is not in the document, say so. Do not make up information.`;

// POST /api/chat — stream AI answer about a specific GO
chatRouter.post("/", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimit = await checkChatRateLimit(ip);
  if (!rateLimit.allowed) {
    return c.json(
      {
        error: "Rate limit exceeded. Max 20 questions per hour.",
        resetInSeconds: rateLimit.resetInSeconds,
      },
      429,
    );
  }

  const body = await c.req.json().catch(() => null);
  const { goId, question } = body ?? {};

  if (!goId || typeof goId !== "string") {
    return c.json({ error: "goId is required" }, 400);
  }
  if (
    !question ||
    typeof question !== "string" ||
    question.trim().length === 0
  ) {
    return c.json({ error: "question is required" }, 400);
  }

  const go = await getGO(goId);
  if (!go) {
    return c.json({ error: "GO not found" }, 404);
  }

  // Fetch and cache PDF text on first chat question
  let pdfText = go.pdfText ?? "";
  if (!pdfText) {
    console.log(`[chat] Extracting PDF text for first time: ${goId}`);
    try {
      pdfText = await extractPDFText(go.pdfUrl);
      await setGO({ ...go, pdfText });
    } catch (err) {
      console.error(`[chat] PDF extraction failed: ${err}`);
      // Fall back to AI overview if PDF fetch fails
      pdfText = go.aiOverview;
    }
  }

  const userContent = `GO Title: ${go.title}\nYear: ${go.year}\n\nDocument:\n${pdfText.slice(0, 30_000)}\n\nQuestion: ${question.trim()}`;

  return streamText(c, async (stream) => {
    try {
      const completion = await client.chat.completions.create(
        {
          model: "abacusai/dracarys-llama-3.1-70b-instruct",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          temperature: 0.3,
          max_tokens: 512,
          stream: true,
        },
        { signal: AbortSignal.timeout(120_000) },
      );

      for await (const chunk of completion) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) await stream.write(text);
      }
    } catch (err) {
      console.error(`[chat] Streaming error: ${err}`);
      await stream.write(`\n\n[Error: ${String(err)}]`);
    }
  });
});

export default chatRouter;
