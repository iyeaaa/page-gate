// 실측 04 — 잠금 하나(src/gate.ts): 경로 판정(접두어 경계·잠금 화면 제외·함수) · 비밀값이 없거나 깨지면 닫힘 · 풀기 흐름
// (닫힘/틀림/막힘/성공 → 초기화) · 쿠키 속성(__Host-·Secure·HttpOnly·SameSite=Lax·Path=/) · 돌아갈 주소(열린 리다이렉트 방지) · 환경 변수 접두어.
import { createGate, gateFromEnv, safeNext } from "../../src/gate.ts";
import { hashPassword } from "../../src/password.ts";
import { memoryStore } from "../../src/throttle.ts";
import { createProbe } from "../lib/probe.ts";

const p = createProbe("04-gate");
const SECRET = "s".repeat(43);
const HASH = await hashPassword("열려라 참깨", { N: 2 ** 10, r: 8, p: 1 }); // 실측은 빠른 파라미터(형식은 같다)

const g = createGate({ secret: SECRET, passwordHash: HASH, protect: ["/paper", "/docs/private/"], throttle: { limit: 3, windowMs: 60_000 } });
const paths: [string, boolean][] = [
  ["/paper", true], ["/paper/", true], ["/paper/x/y", true], ["/paperx", false], ["/pape", false], ["/", false],
  ["/docs/private", true], ["/docs/private/a", true], ["/docs/privateer", false], ["/docs", false], ["/unlock", false], ["/unlock/x", false],
  // 리뷰 지적: 끝 슬래시 접두어("/docs/private/")가 아래를 못 잠갔다 · %인코딩 경로가 잠금을 건너뛸 수 있었다
  ["/%70aper", true], ["/paper%2Fx", true], ["/docs/%70rivate/a", true], ["/unlock%2F", false], ["/%E0%A4%A", false],
];
for (const [path, want] of paths) p.check(`잠금 경로 판정 ${path}`, g.isProtected(path), want);
const all = createGate({ secret: SECRET, passwordHash: HASH, protect: ["/"] });
p.check('protect ["/"] = 전부 잠금, 잠금 화면만 제외', [all.isProtected("/"), all.isProtected("/a/b"), all.isProtected("/unlock")], [true, true, false]);
const fn = createGate({ secret: SECRET, passwordHash: HASH, protect: (x) => !x.startsWith("/s/") });
p.check("protect 함수", [fn.isProtected("/a"), fn.isProtected("/s/t")], [true, false]);

// 닫힌 쪽으로 실패
for (const [label, o] of [
  ["서명 키 없음", { secret: undefined, passwordHash: HASH }],
  ["서명 키 31자", { secret: "s".repeat(31), passwordHash: HASH }],
  ["해시 없음", { secret: SECRET, passwordHash: undefined }],
  ["해시 깨짐", { secret: SECRET, passwordHash: "scrypt:1:2" }],
] as const) {
  const c = createGate({ ...o, protect: ["/"] });
  p.check(`${label} → ready=false · 풀기 closed · 아무 쿠키도 통과 못 함`, [c.ready, (await c.attempt("열려라 참깨")).ok ? "ok" : "closed", c.isUnlocked(g.issueCookie().value)], [false, "closed", false]);
}

// 풀기 흐름
p.check("틀림 → wrong", await g.attempt("아니"), { ok: false, reason: "wrong" });
p.check("문자열 아님 → wrong", await g.attempt(null), { ok: false, reason: "wrong" });
p.check("맞음 → ok, 시도 기록 초기화", await g.attempt("열려라 참깨"), { ok: true });
for (let i = 0; i < 3; i++) await g.attempt("아니");
const blocked = await g.attempt("열려라 참깨");
p.check("한도만큼 시도한 뒤엔 맞는 비밀번호도 막힘(대입 제한)", [blocked.ok, !blocked.ok && blocked.reason, !blocked.ok && blocked.reason === "blocked" && blocked.retryAfterMs > 0], [false, "blocked", true]);

// 쿠키
const c = g.issueCookie(1_800_000_000);
p.check("쿠키 이름 __Host-page-gate", c.name, "__Host-page-gate");
p.check("쿠키 속성 HttpOnly·Secure·Lax·Path=/·7일", c.options, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 604800 });
p.check("발급한 쿠키 → 풀림(만료 전)", g.isUnlocked(c.value, 1_800_000_000 + 604799), true);
p.check("만료 뒤 → 잠김(서명 안 만료로 판단)", g.isUnlocked(c.value, 1_800_000_000 + 604800), false);
p.check("다시 잠그기 쿠키 = 빈 값·maxAge 0", [g.clearCookie().value, g.clearCookie().options.maxAge], ["", 0]);
const other = createGate({ secret: "t".repeat(43), passwordHash: HASH, protect: ["/"] });
p.check("다른 사이트(다른 서명 키) 쿠키는 통하지 않는다", other.isUnlocked(g.issueCookie().value), false);
const rehash = createGate({ secret: SECRET, passwordHash: await hashPassword("새 비번", { N: 2 ** 10, r: 8, p: 1 }), protect: ["/"] });
p.check("비밀번호를 바꾸면 예전 쿠키가 풀린다", rehash.isUnlocked(g.issueCookie().value), false);
const dev = createGate({ secret: SECRET, passwordHash: HASH, protect: ["/"], insecureDevCookie: true });
p.check("개발 모드 쿠키: __Host- 떼고 Secure 끔(http://localhost 용)", [dev.issueCookie().name, dev.issueCookie().options.secure], ["page-gate", false]);
p.check("쿠키 이름·유지 시간 바꾸기", (({ name, options }) => [name, options.maxAge])(createGate({ secret: SECRET, passwordHash: HASH, protect: ["/"], cookieName: "__Host-docs", ttlSeconds: 3600 }).issueCookie()), ["__Host-docs", 3600]);

// 돌아갈 주소
const nexts: [unknown, string][] = [
  ["/paper", "/paper"], ["/paper?x=1", "/paper?x=1"], ["/paper#h", "/paper"], ["//evil.com", "/"], ["/\\evil.com", "/"],
  ["https://evil.com/x", "/"], ["javascript:alert(1)", "/"], ["paper", "/"], ["", "/"], [null, "/"], [42, "/"],
  ["/a/../b", "/b"], ["/%2F%2Fevil.com", "/%2F%2Fevil.com"], ["/" + "a".repeat(600), "/"], ["/\t/evil.com", "/"],
  // 리뷰 지적: 정리(URL 해석)하면 // 가 되살아나는 모양
  ["/x/..//evil.com", "/"], ["/.//evil.com", "/"], ["/./\\evil.com", "/"], ["/a\\..\\\\evil.com", "/"],
];
for (const [n, want] of nexts) p.check(`safeNext ${JSON.stringify(n)?.slice(0, 30)}`, safeNext(n), want);

// 동시 확인 제한 — scrypt 가 한 번 128MiB 라 동시에 몰리면 메모리가 터진다(리뷰 지적)
const slowHash = await hashPassword("느린 비번", { N: 2 ** 14, r: 8, p: 4 });
const cap = createGate({ secret: SECRET, passwordHash: slowHash, protect: ["/"], maxConcurrentVerify: 2, throttle: { limit: 100, windowMs: 60_000 } });
const rs = await Promise.all(Array.from({ length: 8 }, () => cap.attempt("틀림")));
p.check("동시 8번 → 2번만 확인, 나머지 busy", [rs.filter((r) => !r.ok && r.reason === "wrong").length, rs.filter((r) => !r.ok && r.reason === "busy").length], [2, 6]);
p.check("확인이 끝나면 다시 받는다", (await cap.attempt("느린 비번")).ok, true);

// 대입 제한 열쇠 = 쿠키 이름(같은 저장소를 쓰는 사이트끼리 서로 잠그지 않는다)
const shared = memoryStore();
const siteA = createGate({ secret: SECRET, passwordHash: HASH, protect: ["/"], store: shared, cookieName: "__Host-a", throttle: { limit: 2, windowMs: 60_000 } });
const siteB = createGate({ secret: SECRET, passwordHash: HASH, protect: ["/"], store: shared, cookieName: "__Host-b", throttle: { limit: 2, windowMs: 60_000 } });
for (let i = 0; i < 3; i++) await siteA.attempt("아니");
p.check("A 사이트가 막혀도 같은 저장소의 B 사이트는 열린다", [(await siteA.attempt("열려라 참깨")).ok, (await siteB.attempt("열려라 참깨")).ok], [false, true]);

// 환경 변수
const fromEnv = gateFromEnv({ protect: ["/"], env: { DOCS_GATE_SECRET: SECRET, DOCS_GATE_PASSWORD_HASH: HASH }, envPrefix: "DOCS_GATE", store: memoryStore() });
p.check("gateFromEnv 접두어 바꾸기", fromEnv.ready, true);
p.check("gateFromEnv 기본 PAGE_GATE_* 이 없으면 닫힘", gateFromEnv({ protect: ["/"], env: {} }).ready, false);
p.finish();
