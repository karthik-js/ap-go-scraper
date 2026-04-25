import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { handle } from "@hono/node-server/vercel";
import scrapeRouter from "../src/routes/scrape.js";
import gosRouter from "../src/routes/gos.js";
import chatRouter from "../src/routes/chat.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/", (c) => c.json({ service: "AP GO Scraper", status: "ok" }));

app.route("/api/scrape", scrapeRouter);
app.route("/api/gos", gosRouter);
app.route("/api/chat", chatRouter);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error", detail: err.message }, 500);
});

// Local dev server
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Vercel serverless handler
export default handle(app);
export const DELETE = handle(app);
