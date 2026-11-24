// 비밀번호 잠금 하나 = 잠글 경로 + 쿠키 + 비밀번호 확인 + 대입 제한. 프레임워크에 묶이지 않는 핵심(Next 연결은 next.ts).
// - 비밀값(서명 키·비밀번호 해시)이 하나라도 없거나 깨졌으면 잠긴 경로는 아무도 못 연다(닫힌 쪽으로 실패). 운영이면 로그를 한 번 남긴다.
// - 쿠키 이름 기본 `__Host-page-gate`: 브라우저가 Secure·Path=/·Domain 없음을 강제한다(MDN Set-Cookie) — 같은 상위 도메인의
//   다른 사이트가 덮어쓰지 못하고, 사이트마다 따로 풀린다.
// 실측 04.
import { MIN_SECRET_LENGTH } from "./limits.ts";
import { parseHash, verifyPassword } from "./password.ts";
import { DEFAULT_THROTTLE, memoryStore, type ThrottleRule, type ThrottleStore } from "./throttle.ts";
import { passwordFingerprint, signToken, verifyToken } from "./token.ts";

export type GateOptions = {
  /** 쿠키 서명 키(32자 이상). 사이트마다 따로 */
  secret: string | undefined;
  /** `page-gate hash` 가 만든 scrypt 해시 */
  passwordHash: string | undefined;
  /** 잠글 경로: 접두어 목록(`/paper` = /paper 와 /paper/…, 끝 슬래시는 무시) 또는 함수 */
  protect: readonly string[] | ((pathname: string) => boolean);
  unlockPath?: string;
  cookieName?: string;
  /** 풀린 상태 유지 시간(초). 기본 7일 */
  ttlSeconds?: number;
  /** 대입 제한 저장소. 기본 메모리(서버 한 대일 때만) */
  store?: ThrottleStore;
  throttle?: ThrottleRule;
  /** 대입 제한을 세는 열쇠. 기본 = 쿠키 이름 — 저장소(DB)를 같이 쓰는 사이트끼리 서로 잠그지 않게 */
  throttleKey?: string;
  /** 이 프로세스에서 동시에 돌릴 비밀번호 확인 수(scrypt 2^17 은 한 번 128MiB). 넘치면 busy. 기본 2 */
  maxConcurrentVerify?: number;
  /** 개발용 http://localhost 에서도 쿠키를 쓰게(이때 __Host- 를 뗀다). 운영에서 켜지 않는다 */
  insecureDevCookie?: boolean;
};

export type AttemptResult =
  | { ok: true }
  | { ok: false; reason: "blocked"; retryAfterMs: number }
  | { ok: false; reason: "closed" | "wrong" | "busy" };

export type CookieSpec = {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; maxAge: number };
};

/** 경로 비교용: 끝 슬래시를 떼고, %인코딩을 푼 모양도 같이(둘 중 하나라도 잠긴 경로면 잠근다) */
function pathForms(pathname: string): string[] {
  const forms = [pathname];
  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded !== pathname) forms.push(decoded);
  } catch { /* 깨진 % — 원래 모양만 */ }
  return forms;
}

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

export function createGate(o: GateOptions) {
  const unlockPath = trimSlash(o.unlockPath ?? "/unlock");
  const ttlSeconds = o.ttlSeconds ?? 7 * 24 * 60 * 60;
  const baseCookie = o.cookieName ?? "__Host-page-gate";
  const cookieName = o.insecureDevCookie ? baseCookie.replace(/^__(Host|Secure)-/, "") : baseCookie;
  const store = o.store ?? memoryStore();
  const rule = o.throttle ?? DEFAULT_THROTTLE;
  const throttleKey = o.throttleKey ?? baseCookie;
  const maxVerify = o.maxConcurrentVerify ?? 2;
  const ready = !!o.secret && o.secret.length >= MIN_SECRET_LENGTH && !!parseHash(o.passwordHash);
  const fingerprint = ready ? passwordFingerprint(o.secret!, o.passwordHash!) : "";
  const prefixes = typeof o.protect === "function" ? null : o.protect.map(trimSlash);
  let verifying = 0;

  if (!ready && process.env.NODE_ENV === "production") {
    console.error(`[page-gate] 비밀값이 없거나 형식이 깨져 잠긴 경로를 아무도 못 연다(${cookieName}). npx page-gate check-env 로 확인`);
  }

  const isProtected = (pathname: string): boolean =>
    pathForms(pathname).some((p) => {
      const path = trimSlash(p);
      if (path === unlockPath || path.startsWith(`${unlockPath}/`)) return false;
      if (!prefixes) return (o.protect as (x: string) => boolean)(path);
      return prefixes.some((prefix) => prefix === "/" || path === prefix || path.startsWith(`${prefix}/`));
    });

  const cookie = (value: string, maxAge: number): CookieSpec => ({
    name: cookieName, value,
    options: { httpOnly: true, secure: !o.insecureDevCookie, sameSite: "lax", path: "/", maxAge },
  });

  return {
    /** 비밀값이 다 있어 잠금을 풀 수 있는 상태인지 */
    ready,
    unlockPath,
    cookieName,
    ttlSeconds,
    isProtected,
    isUnlocked(cookieValue: string | undefined, now = Date.now() / 1000): boolean {
      return ready && verifyToken(cookieValue, o.secret!, fingerprint, now);
    },
    /** 비밀번호 확인 + 대입 제한(기록 먼저). 틀린 이유(빈 값·길이 초과·불일치)는 구분하지 않는다 */
    async attempt(password: unknown): Promise<AttemptResult> {
      if (!ready) return { ok: false, reason: "closed" };
      const hit = await store.hit(throttleKey, rule);
      if (!hit.allowed) return { ok: false, reason: "blocked", retryAfterMs: hit.retryAfterMs };
      if (verifying >= maxVerify) return { ok: false, reason: "busy" };
      verifying++;
      let ok: boolean;
      try {
        ok = await verifyPassword(password, o.passwordHash!);
      } finally {
        verifying--;
      }
      if (!ok) return { ok: false, reason: "wrong" };
      await store.reset(throttleKey);
      return { ok: true };
    },
    issueCookie(now = Date.now() / 1000): CookieSpec {
      if (!ready) throw new Error("page-gate: 서명 키·비밀번호 해시가 없다");
      return cookie(signToken(o.secret!, fingerprint, Math.floor(now) + ttlSeconds), ttlSeconds);
    },
    clearCookie(): CookieSpec {
      return cookie("", 0);
    },
  };
}

export type Gate = ReturnType<typeof createGate>;

/** 환경 변수에서 비밀값을 읽는다: <prefix>_SECRET · <prefix>_PASSWORD_HASH (기본 PAGE_GATE) */
export function gateFromEnv(o: Omit<GateOptions, "secret" | "passwordHash"> & { envPrefix?: string; env?: Record<string, string | undefined> }) {
  const { env = process.env, envPrefix = "PAGE_GATE", ...rest } = o;
  return createGate({ ...rest, secret: env[`${envPrefix}_SECRET`], passwordHash: env[`${envPrefix}_PASSWORD_HASH`] });
}

/** 잠금을 푼 뒤 돌아갈 주소 — 같은 사이트 안의 경로만(열린 리다이렉트 방지).
 *  주소를 정리(URL 해석)한 «뒤»에도 다시 본다: `/x/..//evil.com` 은 정리하면 `//evil.com` 이 된다(리뷰 지적, 실측 04). */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || next.length > 512) return fallback;
  const external = (s: string) => !s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\");
  if (external(next)) return fallback;
  try {
    const u = new URL(next, "http://x");
    const out = `${u.pathname}${u.search}`;
    return u.host === "x" && !external(out) ? out : fallback;
  } catch {
    return fallback;
  }
}
