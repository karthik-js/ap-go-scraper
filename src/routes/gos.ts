import { Hono } from "hono";
import { getAllGOs, getGO } from "../lib/cache.js";

const gosRouter = new Hono();

// GET /api/gos?year=2024&search=ms42&sort=asc
gosRouter.get("/", async (c) => {
  const yearFilter = c.req.query("year");
  const search = c.req.query("search")?.toLowerCase();
  const sort = c.req.query("sort") === "asc" ? "asc" : "desc";

  let gos = await getAllGOs();

  if (yearFilter) {
    gos = gos.filter((go) => go.year === yearFilter);
  }

  if (search) {
    gos = gos.filter(
      (go) =>
        go.id.toLowerCase().includes(search) ||
        go.title.toLowerCase().includes(search),
    );
  }

  gos.sort((a, b) =>
    sort === "asc"
      ? Number(a.year) - Number(b.year)
      : Number(b.year) - Number(a.year),
  );

  c.header("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
  return c.json({ total: gos.length, gos });
});

// GET /api/gos/:id
gosRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const go = await getGO(id);

  if (!go) {
    return c.json({ error: "GO not found" }, 404);
  }

  c.header("Cache-Control", "s-maxage=86400, stale-while-revalidate=3600");
  return c.json(go);
});

export default gosRouter;
