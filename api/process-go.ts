// Vercel Queue consumer entry point — invoked by Vercel infrastructure only.
// Registered as a queue consumer in vercel.json (topic: "go-processing").
export { POST } from "../src/routes/process-go.js";
