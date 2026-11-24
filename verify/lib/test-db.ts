// 실측용 빈 Postgres DB — 실측마다 새로 만들고 끝나면 지운다. TEST_DATABASE_URL(관리 권한), 기본 로컬 Docker:
// docker run -d --name dg-pg -e POSTGRES_PASSWORD=dg -e POSTGRES_DB=dg -p 55432:5432 postgres:17-alpine
import pg from "pg";

const ADMIN = process.env.TEST_DATABASE_URL ?? "postgres://postgres:dg@127.0.0.1:55432/dg";

export async function makeTestDb(prefix = "pg_gate") {
  const name = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const u = new URL(ADMIN);
  u.pathname = `/${name}`;
  const db = new pg.Pool({ connectionString: u.toString(), max: 10 });
  return {
    db,
    cleanup: async () => {
      await db.end().catch(() => {});
      const a = new pg.Client({ connectionString: ADMIN });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}
