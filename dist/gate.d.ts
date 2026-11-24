import { type ThrottleRule, type ThrottleStore } from "./throttle.ts";
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
export type AttemptResult = {
    ok: true;
} | {
    ok: false;
    reason: "blocked";
    retryAfterMs: number;
} | {
    ok: false;
    reason: "closed" | "wrong" | "busy";
};
export type CookieSpec = {
    name: string;
    value: string;
    options: {
        httpOnly: true;
        secure: boolean;
        sameSite: "lax";
        path: "/";
        maxAge: number;
    };
};
export declare function createGate(o: GateOptions): {
    /** 비밀값이 다 있어 잠금을 풀 수 있는 상태인지 */
    ready: boolean;
    unlockPath: string;
    cookieName: string;
    ttlSeconds: number;
    isProtected: (pathname: string) => boolean;
    isUnlocked(cookieValue: string | undefined, now?: number): boolean;
    /** 비밀번호 확인 + 대입 제한(기록 먼저). 틀린 이유(빈 값·길이 초과·불일치)는 구분하지 않는다 */
    attempt(password: unknown): Promise<AttemptResult>;
    issueCookie(now?: number): CookieSpec;
    clearCookie(): CookieSpec;
};
export type Gate = ReturnType<typeof createGate>;
/** 환경 변수에서 비밀값을 읽는다: <prefix>_SECRET · <prefix>_PASSWORD_HASH (기본 PAGE_GATE) */
export declare function gateFromEnv(o: Omit<GateOptions, "secret" | "passwordHash"> & {
    envPrefix?: string;
    env?: Record<string, string | undefined>;
}): {
    /** 비밀값이 다 있어 잠금을 풀 수 있는 상태인지 */
    ready: boolean;
    unlockPath: string;
    cookieName: string;
    ttlSeconds: number;
    isProtected: (pathname: string) => boolean;
    isUnlocked(cookieValue: string | undefined, now?: number): boolean;
    /** 비밀번호 확인 + 대입 제한(기록 먼저). 틀린 이유(빈 값·길이 초과·불일치)는 구분하지 않는다 */
    attempt(password: unknown): Promise<AttemptResult>;
    issueCookie(now?: number): CookieSpec;
    clearCookie(): CookieSpec;
};
/** 잠금을 푼 뒤 돌아갈 주소 — 같은 사이트 안의 경로만(열린 리다이렉트 방지).
 *  주소를 정리(URL 해석)한 «뒤»에도 다시 본다: `/x/..//evil.com` 은 정리하면 `//evil.com` 이 된다(리뷰 지적, 실측 04). */
export declare function safeNext(next: unknown, fallback?: string): string;
