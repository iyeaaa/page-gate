export const DEFAULT_THROTTLE = { limit: 10, windowMs: 10 * 60 * 1000 };
/** 프로세스 하나 안에서만 센다. 서버리스에서는 쓰지 않는다 */
export function memoryStore(now = Date.now) {
    const map = new Map();
    return {
        async hit(key, rule) {
            const t = now();
            const list = (map.get(key) ?? []).filter((x) => x > t - rule.windowMs);
            if (list.length >= rule.limit) {
                map.set(key, list);
                return { allowed: false, retryAfterMs: Math.max(1, list[0] + rule.windowMs - t) };
            }
            list.push(t);
            map.set(key, list);
            return { allowed: true };
        },
        async reset(key) {
            map.delete(key);
        },
    };
}
