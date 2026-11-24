// 실측용 시간 재기 — 여러 번 돌려 중앙값·최댓값(ms).
export async function timeIt(fn: () => unknown | Promise<unknown>, runs = 20) {
  const ms: number[] = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); await fn(); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  const r = (n: number) => Math.round(n * 10) / 10;
  return { median: r(ms[Math.floor(ms.length / 2)]!), max: r(ms[ms.length - 1]!), runs };
}
