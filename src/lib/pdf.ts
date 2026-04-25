import { getDocumentProxy, extractText } from "unpdf";

const PDF_FETCH_TIMEOUT_MS = 60_000;

export async function extractPDFText(pdfUrl: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(pdfUrl, {
      signal: AbortSignal.timeout(PDF_FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AP-GO-Scraper/1.0)",
        "Accept": "application/pdf,*/*",
      },
    });
  } catch (err) {
    throw new Error(`PDF fetch failed for ${pdfUrl}: ${err}`);
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
