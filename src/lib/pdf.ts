import { getDocumentProxy, extractText } from "unpdf";

const PDF_FETCH_TIMEOUT_MS = 60_000;

export async function extractPDFText(pdfUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(pdfUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AP-GO-Scraper/1.0)",
        "Accept": "application/pdf,*/*",
      },
    });
  } catch (err) {
    throw new Error(`PDF fetch failed for ${pdfUrl}: ${err}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`PDF fetch HTTP error: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  console.log(`[pdf] Downloaded ${(buffer.byteLength / 1024).toFixed(1)} KB from ${pdfUrl}`);

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  console.log(`[pdf] Extracted ${text.length} characters`);
  return text;
}
