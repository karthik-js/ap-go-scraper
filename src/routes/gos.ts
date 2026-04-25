import { Hono } from "hono";
import { getAllGOs, getGO } from "../lib/cache.js";

const gosRouter = new Hono();

// GET /api/gos?year=2024
gosRouter.get("/", async (c) => {
  const yearFilter = c.req.query("year");

  let gos = await getAllGOs();

  if (yearFilter) {
    gos = gos.filter((go) => go.year === yearFilter);
  }

  gos.sort((a, b) => Number(b.year) - Number(a.year));

  return c.json({ total: gos.length, gos });
});

// GET /api/gos/:id
gosRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const go = await getGO(id);

  if (!go) {
    return c.json({ error: "GO not found" }, 404);
  }

  return c.json(go);
});

export default gosRouter;
