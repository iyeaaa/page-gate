// 실측 공통 틀 — 모든 probe 가 이걸로 결과를 찍고 verify/results/<이름>.json 에 남긴다.
// 실측은 "기대값과 실제값"을 같이 남겨야 나중에 같은 질문이 나왔을 때 다시 돌려 비교할 수 있다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Check = { label: string; ok: boolean; actual: unknown; expected?: unknown; note?: string };

const RESULTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');

export function createProbe(name: string) {
  const checks: Check[] = [];
  const started = new Date();
  return {
    /** 기대값과 같으면 통과. expected 가 함수면 술어로 쓴다. */
    check(label: string, actual: unknown, expected: unknown, note?: string) {
      const ok = typeof expected === 'function'
        ? Boolean((expected as (v: unknown) => boolean)(actual))
        : JSON.stringify(actual) === JSON.stringify(expected);
      checks.push({ label, ok, actual, expected: typeof expected === 'function' ? String(expected) : expected, note });
      console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : `\n     실제: ${JSON.stringify(actual)}\n     기대: ${typeof expected === 'function' ? String(expected) : JSON.stringify(expected)}`}`);
      return ok;
    },
    /** 판정 없이 관찰값만 기록(수치·버전 등). */
    observe(label: string, actual: unknown) {
      checks.push({ label, ok: true, actual, note: 'observe' });
      console.log(`📏 ${label}: ${typeof actual === 'string' ? actual : JSON.stringify(actual)}`);
    },
    /** 결과 파일을 쓰고, 하나라도 실패면 종료 코드 1. */
    finish() {
      mkdirSync(RESULTS, { recursive: true });
      const failed = checks.filter((c) => !c.ok).length;
      writeFileSync(join(RESULTS, `${name}.json`), JSON.stringify({
        probe: name, ranAt: started.toISOString(), node: process.version, failed, checks,
      }, null, 2) + '\n');
      console.log(`— ${name}: ${checks.length - failed}/${checks.length} 통과`);
      if (failed) process.exitCode = 1;
    },
  };
}
