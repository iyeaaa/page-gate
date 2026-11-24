// 실측 전부(또는 일부)를 차례로 — `npm run verify` · `npm run verify -- 06 10`. DB 를 쓰는 실측은 로컬 Docker Postgres(verify/lib/test-db.ts).
// 운영에 대고: BASE=https://docs.yiye.in MCP_TOKEN=… NEXTAUTH_SECRET=… ALLOWED_SUBJECT=… node verify/probes/10-app-http.ts
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, 'probes');
const want = process.argv.slice(2);
const all = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
const pick = want.length ? all.filter((f) => want.some((w) => f.startsWith(w))) : all;
const rows: string[] = [];
for (const f of pick) {
  console.log(`\n▶ ${f}`);
  const r = spawnSync(process.execPath, [join(dir, f)], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  process.stdout.write(r.stdout);
  rows.push(`${r.status === 0 ? '✅' : '❌'} ${f} ${r.stdout.split('\n').find((l) => l.startsWith('—'))?.replace(/^— [^:]+: /, '') ?? ''}`);
}
console.log(`\n${rows.join('\n')}`);
if (rows.some((r) => r.startsWith('❌'))) process.exitCode = 1;
