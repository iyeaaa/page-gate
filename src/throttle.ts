// 비밀번호 대입 제한. 비밀번호가 하나뿐이라 실패는 IP 가 아니라 «잠금 단위(key)»로 센다(OWASP Authentication: 계정 단위 —
// IP 를 바꿔 가며 돌리는 걸 막는다). 잠금은 짧게(시간 창이 지나면 풀린다 — OWASP WSTG: 영구 잠금은 서비스 방해가 된다).
// - «먼저 기록하고 그다음 비밀번호를 본다»(hit): 확인(scrypt 100ms+) 뒤에 기록하면 동시에 보낸 요청들이 모두 옛 횟수를 보고
//   한도를 건너뛴다(리뷰 지적 → 실측 03 동시 50번). 한도에 닿으면 더 기록하지 않는다(공격이 계속돼도 표가 커지지 않는다).
// - 남은 시간은 저장소가 계산한다(Postgres 면 DB 시계) — 앱 시계와 DB 시계가 달라도 어긋나지 않게.
// - 저장소는 갈아 끼운다: 서버 한 대·프로세스 하나면 memoryStore, 서버리스(Vercel fluid compute — 인스턴스끼리 메모리를 나누지
//   않는다)면 stores/postgres 같은 공유 저장소. 실측 03.
export type ThrottleRule = { limit: number; windowMs: number };
export const DEFAULT_THROTTLE: ThrottleRule = { limit: 10, windowMs: 10 * 60 * 1000 };

export type HitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

export type ThrottleStore = {
  /** 시도 한 번. 최근 windowMs 안 기록이 limit 보다 적으면 기록하고 allowed, 아니면 기록하지 않고 남은 시간 */
  hit(key: string, rule: ThrottleRule): Promise<HitResult>;
  /** 성공하면 그 key 의 기록을 지운다 */
  reset(key: string): Promise<void>;
};

/** 프로세스 하나 안에서만 센다. 서버리스에서는 쓰지 않는다 */
export function memoryStore(now: () => number = Date.now): ThrottleStore {
  const map = new Map<string, number[]>();
  return {
    async hit(key, rule) {
      const t = now();
      const list = (map.get(key) ?? []).filter((x) => x > t - rule.windowMs);
      if (list.length >= rule.limit) {
        map.set(key, list);
        return { allowed: false, retryAfterMs: Math.max(1, list[0]! + rule.windowMs - t) };
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
