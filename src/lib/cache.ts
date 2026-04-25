import { Redis } from "@upstash/redis";
import type { GO } from "../types.js";

let _redis: Redis | null = null;

function getRedis(): Redis {
  _redis ??= new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
  return _redis;
}

const INDEX_KEY = "go:index";

// ── Job status ────────────────────────────────────────────────────────────────

export interface JobStatus {
  jobId: string;
  total: number;
  done: number;
  failed: number;
  errors: string[];
  startedAt: string;
}

function jobKey(jobId: string): string {
  return `job:${jobId}`;
}

export async function setJobStatus(status: JobStatus): Promise<void> {
  await getRedis().set(jobKey(status.jobId), status, { ex: 60 * 60 * 24 }); // 24h TTL
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  return getRedis().get<JobStatus>(jobKey(jobId));
}

export async function incrementJobDone(jobId: string): Promise<void> {
  const status = await getJobStatus(jobId);
  if (!status) return;
  status.done++;
  await setJobStatus(status);
}

export async function incrementJobFailed(
  jobId: string,
  error: string,
): Promise<void> {
  const status = await getJobStatus(jobId);
  if (!status) return;
  status.failed++;
  status.errors.push(error);
  await setJobStatus(status);
}

function goKey(id: string): string {
  return `go:${id}`;
}

export async function getGO(id: string): Promise<GO | null> {
  return getRedis().get<GO>(goKey(id));
}

export async function setGO(go: GO): Promise<void> {
  await getRedis().set(goKey(go.id), go);
}

export async function getAllGOIds(): Promise<string[]> {
  const ids = await getRedis().get<string[]>(INDEX_KEY);
  return ids ?? [];
}

export async function addGOToIndex(id: string): Promise<void> {
  const ids = await getAllGOIds();
  if (!ids.includes(id)) {
    ids.push(id);
    await getRedis().set(INDEX_KEY, ids);
  }
}

export async function getAllGOs(): Promise<GO[]> {
  const ids = await getAllGOIds();
  if (ids.length === 0) return [];

  const keys = ids.map(goKey);
  const results = await getRedis().mget<GO[]>(...keys);
  return results.filter((go): go is GO => go !== null);
}
