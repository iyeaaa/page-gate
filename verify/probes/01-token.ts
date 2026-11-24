// 실측 01 — 잠금 쿠키 토큰(src/token.ts): 예외 상황 + 포트폴리오 원본 코드와 같은 값을 만들고 서로 받아 주는가.
import { passwordFingerprint, signToken, verifyToken } from "../../src/token.ts";
import { loadPortfolioGate } from "../lib/portfolio.ts";
import { createProbe } from "../lib/probe.ts";

const p = createProbe("01-token");
const S = "secret-a".padEnd(43, "x");
const fp = passwordFingerprint(S, "scrypt:hash-1");
const now = 1_800_000_000;
const good = signToken(S, fp, now + 60);
const [v, exp, f, sig] = good.split(".") as [string, string, string, string];

const cases: [string, boolean, boolean][] = [
  ["정상", verifyToken(good, S, fp, now), true],
  ["만료 직전(1초 남음)", verifyToken(good, S, fp, now + 59), true],
  ["만료 시각 정각", verifyToken(good, S, fp, now + 60), false],
  ["만료 지남", verifyToken(good, S, fp, now + 61), false],
  ["다른 서명 키", verifyToken(good, "secret-b".padEnd(43, "x"), fp, now), false],
  ["비밀번호 바뀜(지문 다름)", verifyToken(good, S, passwordFingerprint(S, "scrypt:hash-2"), now), false],
  ["만료 늘려 위조", verifyToken(`${v}.${now + 99999}.${f}.${sig}`, S, fp, now), false],
  ["서명 한 글자 변조", verifyToken(`${v}.${exp}.${f}.${sig.slice(0, -1)}${sig.at(-1) === "A" ? "B" : "A"}`, S, fp, now), false],
  ["서명 길이 다름(예외 없이 false)", verifyToken(`${v}.${exp}.${f}.${sig}xx`, S, fp, now), false],
  ["서명 비움", verifyToken(`${v}.${exp}.${f}.`, S, fp, now), false],
  ["버전 다름", verifyToken(`v2.${exp}.${f}.${sig}`, S, fp, now), false],
  ["만료 소수점(조각 수 틀림)", verifyToken(`${v}.${exp}.5.${f}.${sig}`, S, fp, now), false],
  ["만료 숫자 아님", verifyToken(`${v}.abc.${f}.${sig}`, S, fp, now), false],
  ["만료 지수 표기", verifyToken(`${v}.1e10.${f}.${sig}`, S, fp, now), false],
  ["조각 수 부족", verifyToken(`${v}.${exp}.${f}`, S, fp, now), false],
  ["undefined", verifyToken(undefined, S, fp, now), false],
  ["빈 문자열", verifyToken("", S, fp, now), false],
  ["아주 긴 값", verifyToken("a".repeat(10_000), S, fp, now), false],
  ["한글·멀티바이트 서명", verifyToken(`${v}.${exp}.${f}.${"가".repeat(sig.length / 3)}`, S, fp, now), false],
];
for (const [name, got, want] of cases) p.check(name, got, want);

// 포트폴리오 원본과 같은가 — 같은 입력이면 같은 쿠키, 서로의 쿠키를 받아 준다
const pf = await loadPortfolioGate();
p.check("지문이 포트폴리오 원본과 같다", pf.token.passwordFingerprint(S, "scrypt:hash-1"), fp);
p.check("같은 입력 → 포트폴리오 원본과 같은 쿠키", pf.token.signToken(S, fp, now + 60), good);
p.check("포트폴리오가 만든 쿠키를 받아 준다", verifyToken(pf.token.signToken(S, fp, now + 600), S, fp, now), true);
p.check("우리 쿠키를 포트폴리오가 받아 준다", pf.token.verifyToken(signToken(S, fp, now + 600), S, fp, now), true);

p.finish();
