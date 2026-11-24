// 대입 제한 저장소 — Postgres. 서버리스처럼 인스턴스가 여럿이어도 같이 센다(Vercel fluid compute 는 메모리를 나누지 않는다).
// pg 에 의존하지 않는다: { query(sql, args) } 만 있으면 된다(node-postgres Pool·Client 등).
// key 마다 줄 하나(고정 시간 창 카운터)를 INSERT … ON CONFLICT DO UPDATE 로 올린다: 같은 줄을 고치는 요청은 DB 가 줄 잠금으로 줄 세우고
// 각자 «바로 앞 요청이 올린 값»을 본다. 실측 03: «센 뒤 기록»을 한 문장(CTE)으로 해도 동시에 돈 문장끼리는 서로의 기록을 못 봐
// 동시 50번 중 11번이 통과했다(풀 연결 10개) → 카운터 줄로 바꾸니 정확히 한도만큼. 막힌 동안에도 줄은 하나(표가 커지지 않는다).
// 남은 시간은 DB 시계로 계산한다(앱·DB 시계가 달라도 어긋나지 않게).
import type { ThrottleStore } from "../throttle.ts";

export type Queryable = { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }> };

const NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const DEFAULT_TABLE = "page_gate_attempts";

/** 표 만들기 SQL — 앱이 자기 스키마 초기화에 그대로 넣어도 된다 */
export function postgresStoreDDL(table = DEFAULT_TABLE): string[] {
  if (!NAME.test(table)) throw new Error(`page-gate: 표 이름이 올바르지 않음: ${table}`);
  return [`CREATE TABLE IF NOT EXISTS ${table} (key text PRIMARY KEY, window_start timestamptz NOT NULL, count int NOT NULL)`];
}

export function postgresStore(db: Queryable, opts: { table?: string } = {}): ThrottleStore & { ensureTable(): Promise<void> } {
  const table = opts.table ?? DEFAULT_TABLE;
  const ddl = postgresStoreDDL(table);
  const expired = `${table}.window_start <= clock_timestamp() - make_interval(secs => $2::float8 / 1000)`;
  return {
    async ensureTable() {
      for (const sql of ddl) await db.query(sql); // 문장마다 따로 — 다중 문장을 받지 않는 드라이버가 있다
    },
    async hit(key, rule) {
      const r = await db.query(`INSERT INTO ${table} AS t (key, window_start, count) VALUES ($1, clock_timestamp(), 1)
        ON CONFLICT (key) DO UPDATE SET
          window_start = CASE WHEN ${expired.replaceAll(`${table}.`, "t.")} THEN clock_timestamp() ELSE t.window_start END,
          count = CASE WHEN ${expired.replaceAll(`${table}.`, "t.")} THEN 1 ELSE least(t.count + 1, 1000000000) END
        RETURNING count, ceil(extract(epoch FROM window_start + make_interval(secs => $2::float8 / 1000) - clock_timestamp()) * 1000)::float8 AS retry_ms`,
      [key, rule.windowMs]);
      const row = r.rows[0] as { count: number; retry_ms: number };
      return row.count <= rule.limit ? { allowed: true } : { allowed: false, retryAfterMs: Math.max(1, Number(row.retry_ms)) };
    },
    async reset(key) {
      await db.query(`DELETE FROM ${table} WHERE key = $1`, [key]);
    },
  };
}
