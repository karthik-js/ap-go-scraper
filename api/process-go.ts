import { handleCallback } from "@vercel/queue";

// TEMPORARY DRAIN: silently drops all queued messages to clear the backlog.
// Once the queue is empty, revert this file to the real consumer.
export const POST = handleCallback(async (data, metadata) => {
  console.log(`[drain] Dropping message (delivery #${metadata.deliveryCount})`, JSON.stringify(data).slice(0, 100));
  // Return without throwing — message is acknowledged and removed from queue
});
