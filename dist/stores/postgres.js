const NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const DEFAULT_TABLE = "page_gate_attempts";
/** 표 만들기 SQL — 앱이 자기 스키마 초기화에 그대로 넣어도 된다 */
export function postgresStoreDDL(table = DEFAULT_TABLE) {
    if (!NAME.test(table))
        throw new Error(`page-gate: 표 이름이 올바르지 않음: ${table}`);
    return [`CREATE TABLE IF NOT EXISTS ${table} (key text PRIMARY KEY, window_start timestamptz NOT NULL, count int NOT NULL)`];
}
export function postgresStore(db, opts = {}) {
    const table = opts.table ?? DEFAULT_TABLE;
    const ddl = postgresStoreDDL(table);
    const expired = `${table}.window_start <= clock_timestamp() - make_interval(secs => $2::float8 / 1000)`;
    return {
        async ensureTable() {
            for (const sql of ddl)
                await db.query(sql); // 문장마다 따로 — 다중 문장을 받지 않는 드라이버가 있다
        },
        async hit(key, rule) {
            const r = await db.query(`INSERT INTO ${table} AS t (key, window_start, count) VALUES ($1, clock_timestamp(), 1)
        ON CONFLICT (key) DO UPDATE SET
          window_start = CASE WHEN ${expired.replaceAll(`${table}.`, "t.")} THEN clock_timestamp() ELSE t.window_start END,
          count = CASE WHEN ${expired.replaceAll(`${table}.`, "t.")} THEN 1 ELSE least(t.count + 1, 1000000000) END
        RETURNING count, ceil(extract(epoch FROM window_start + make_interval(secs => $2::float8 / 1000) - clock_timestamp()) * 1000)::float8 AS retry_ms`, [key, rule.windowMs]);
            const row = r.rows[0];
            return row.count <= rule.limit ? { allowed: true } : { allowed: false, retryAfterMs: Math.max(1, Number(row.retry_ms)) };
        },
        async reset(key) {
            await db.query(`DELETE FROM ${table} WHERE key = $1`, [key]);
        },
    };
}
