import { Hono } from "hono";
import { getAllGOs, getGO } from "../lib/cache.js";

const gosRouter = new Hono();

// GET /api/gos?department=finance&year=2024
gosRouter.get("/", async (c) => {
  const departmentFilter = c.req.query("department")?.toLowerCase();
  const yearFilter = c.req.query("year");

  let gos = await getAllGOs();

  if (departmentFilter) {
    gos = gos.filter((go) => go.department.toLowerCase().includes(departmentFilter));
  }

  if (yearFilter) {
    gos = gos.filter((go) => go.year === yearFilter);
  }

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
