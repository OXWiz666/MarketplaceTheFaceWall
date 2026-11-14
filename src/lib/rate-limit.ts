type Entry = { count: number; expires: number };
const requests = new Map<string, Entry>();

export function isRateLimited(key: string, limit = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = requests.get(key);
  if (!entry || entry.expires <= now) {
    requests.set(key, { count: 1, expires: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}
