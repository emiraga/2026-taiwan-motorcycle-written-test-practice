import type { BankProgress } from "../../src/types";
import { isBankProgress, mergeProgress } from "../../src/lib/merge";

interface Env {
  motorcycle_exam_progress: KVNamespace;
  SYNC_SECRET: string;
}

function kvKey(bank: string): string {
  return `progress:${bank}`;
}

/**
 * POST /api/sync — two-way sync of a single bank's progress.
 *
 * The body is this device's `BankProgress`. We union it with whatever is stored
 * in KV (using the same conflict-free `mergeProgress` as the client), persist the
 * union, and return it so the caller can adopt it. Doing the merge server-side in
 * one request keeps concurrent devices from clobbering each other.
 */
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const expected = `Bearer ${ctx.env.SYNC_SECRET}`;
  if (
    !ctx.env.SYNC_SECRET ||
    ctx.request.headers.get("Authorization") !== expected
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let incoming: unknown;
  try {
    incoming = await ctx.request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!isBankProgress(incoming)) {
    return new Response("Body is not a valid progress object", { status: 400 });
  }

  const key = kvKey(incoming.bank);
  const stored = await ctx.env.motorcycle_exam_progress.get(key);
  const remote: BankProgress = stored
    ? (JSON.parse(stored) as BankProgress)
    : { bank: incoming.bank, answers: {} };

  const merged = mergeProgress(remote, incoming);
  await ctx.env.motorcycle_exam_progress.put(key, JSON.stringify(merged));

  return new Response(JSON.stringify(merged), {
    headers: { "Content-Type": "application/json" },
  });
};
