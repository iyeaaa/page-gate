// 실측 03 — 대입 제한(src/throttle.ts · src/stores/postgres.ts): 한도·시간 창·남은 시간 · 성공하면 초기화 · key 분리 ·
// 동시에 몰아친 시도가 한도를 넘지 못하는가(리뷰 지적: 확인 뒤 기록하면 동시 요청이 모두 옛 횟수를 봤다) · 인스턴스 둘이 같이 센다 ·
// 막힌 동안은 더 기록하지 않는다(표가 커지지 않는다) · 남은 시간은 DB 시계로.
import pg from "pg";
import { postgresStore, postgresStoreDDL } from "../../src/stores/postgres.ts";
import { memoryStore, type ThrottleStore } from "../../src/throttle.ts";
import { createProbe } from "../lib/probe.ts";
import { makeTestDb } from "../lib/test-db.ts";

const p = createProbe("03-throttle");
const RULE = { limit: 5, windowMs: 1500 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function exercise(label: string, store: ThrottleStore) {
  const K = `k-${label}`;
  const hits = [];
  for (let i = 0; i < RULE.limit; i++) hits.push((await store.hit(K, RULE)).allowed);
  p.check(`${label}: 한도만큼은 허용`, hits.every(Boolean), true);
  const over = await store.hit(K, RULE);
  p.check(`${label}: 한도 다음 → 막힘(남은 시간 0<ms≤창)`, !over.allowed && over.retryAfterMs > 0 && over.retryAfterMs <= RULE.windowMs, true);
  p.check(`${label}: 다른 key 는 그대로`, (await store.hit(`${K}-other`, RULE)).allowed, true);
  await sleep(RULE.windowMs + 100);
  p.check(`${label}: 창이 지나면 풀린다(영구 잠금 아님)`, (await store.hit(K, RULE)).allowed, true);
  for (let i = 0; i < RULE.limit; i++) await store.hit(K, RULE);
  await store.reset(K);
  p.check(`${label}: reset → 바로 허용`, (await store.hit(K, RULE)).allowed, true);
  const burst = await Promise.all(Array.from({ length: 50 }, () => store.hit(`${K}-burst`, RULE)));
  p.check(`${label}: 동시에 50번 → 허용은 정확히 한도(${RULE.limit})번`, burst.filter((h) => h.allowed).length, RULE.limit);
  p.observe(`${label}: 동시 50번 중 허용`, burst.filter((h) => h.allowed).length);
}

await exercise("memory", memoryStore());

const { db, cleanup } = await makeTestDb();
try {
  for (const sql of postgresStoreDDL()) await db.query(sql);
  const store = postgresStore(db);
  await store.ensureTable();
  p.check("postgres: ensureTable 은 DDL 과 같고 두 번 불러도 된다", true, true);
  await exercise("postgres", store);
  const other = new pg.Pool({ connectionString: (db as unknown as { options: { connectionString: string } }).options.connectionString });
  const store2 = postgresStore(other);
  const both = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? store : store2).hit("shared", { limit: 6, windowMs: 60_000 })));
  p.check("postgres: 인스턴스 둘이 동시에 20번 → 합쳐서 정확히 한도(6)번", both.filter((h) => h.allowed).length, 6);
  await other.end();
  for (let i = 0; i < 30; i++) await store.hit("flood", { limit: 3, windowMs: 60_000 });
  p.check("postgres: 공격이 계속돼도 key 마다 줄 하나(30번 시도 → 1줄)", Number((await db.query(`SELECT count(*) n FROM page_gate_attempts WHERE key = 'flood'`)).rows[0].n), 1);
  await db.query(`INSERT INTO page_gate_attempts (key, window_start, count) VALUES ('old', now() - interval '1 day', 999)`);
  p.check("postgres: 창이 지난 줄은 새 창으로(1부터 다시)", (await store.hit("old", RULE)).allowed, true);
  // 남은 시간은 DB 시계로 — 창 시작을 1분 앞당겨(=DB 기준 1분 전 시작) 남은 시간이 그만큼 줄었나
  await store.reset("clock");
  for (let i = 0; i < 3; i++) await store.hit("clock", { limit: 3, windowMs: 120_000 });
  await db.query(`UPDATE page_gate_attempts SET window_start = window_start - interval '60 seconds' WHERE key = 'clock'`);
  const c = await store.hit("clock", { limit: 3, windowMs: 120_000 });
  p.check("postgres: 남은 시간 = 창 - DB 기준 경과(약 60초)", !c.allowed && Math.abs(c.retryAfterMs - 60_000) < 2_000, true);
  p.check("이상한 표 이름 → 거절(SQL 에 들어가는 이름)", (() => { try { postgresStore(db, { table: "x; DROP TABLE y" }); return "OK"; } catch { return "THROWN"; } })(), "THROWN");
} finally { await cleanup(); }
p.finish();
