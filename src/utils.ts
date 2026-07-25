export async function asyncFilter<T>(
    arr: T[],
    predicate: (item: T) => Promise<boolean>
): Promise<T[]> {
    const results = await Promise.all(arr.map(predicate));
    return arr.filter((_, index) => results[index]);
}
export function getRandomHexColor(withHash: boolean = false): string {
    const color = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    return withHash ? `#${color}` : color;
}

/**
 * De-dupes and rate-limits calls to `fn`: a cache hit within its TTL is served straight from the
 * map, and an in-flight call is shared with any other caller for the same key that lands before it
 * resolves (the pending promise itself is what's cached, before it has a value) - without this,
 * a burst of concurrent callers for the same key would each fire their own call.
 */
export function withCache<T>(
    cache: Map<string, { expires: number; promise: Promise<T> }>,
    key: string,
    ttlMs: number,
    fn: () => Promise<T>
): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;
    const promise = fn().catch(err => {
        cache.delete(key);
        throw err;
    });
    cache.set(key, { expires: Date.now() + ttlMs, promise });
    return promise;
}
