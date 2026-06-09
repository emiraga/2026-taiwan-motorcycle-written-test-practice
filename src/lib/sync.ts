import type { BankProgress } from "@/types";
import { isBankProgress } from "@/lib/merge";

/**
 * Sync this device's progress with the Cloudflare backend: the server merges the
 * posted progress with what it has stored (a conflict-free union of attempts) and
 * returns the merged result, which the caller should then adopt locally.
 *
 * `secret` is the shared passphrase, sent as a bearer token and checked against
 * the function's `SYNC_SECRET`.
 */
export async function syncBank(
  progress: BankProgress,
  secret: string,
): Promise<BankProgress> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(progress),
  });

  if (res.status === 401) {
    throw new Error("Sync failed: wrong passphrase.");
  }
  if (!res.ok) {
    throw new Error(`Sync failed: HTTP ${res.status}`);
  }

  const data: unknown = await res.json();
  if (!isBankProgress(data)) {
    throw new Error("Sync failed: invalid response from server.");
  }
  return data;
}
