/**
 * Resolve a path to a static asset under /public so it works no matter which
 * folder the built app is served from. Vite's BASE_URL reflects the configured
 * `base` (e.g. "./"), so prefixing keeps fetches relative to index.html instead
 * of hard-coding the domain root.
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
