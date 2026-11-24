// 실측 02 — 비밀번호 해시(src/password.ts): 포트폴리오 해시(2^14/8/5)를 그대로 확인하는가 · 새 기본값(2^17/8/1 = OWASP 최소)의
// 시간·동시 메모리 · 깨진 저장값·터무니없는 파라미터는 «틀림» · 입력 길이 상한 · 유니코드 정규화.
import { DEFAULT_SCRYPT, hashPassword, MAX_PASSWORD_LENGTH, parseHash, verifyPassword } from "../../src/password.ts";
import { loadPortfolioGate } from "../lib/portfolio.ts";
import { createProbe } from "../lib/probe.ts";
import { timeIt } from "../../verify/lib/timing.ts";

const p = createProbe("02-password");
const pf = await loadPortfolioGate();

const pfHash = await pf.password.hashPassword("포트폴리오 비번 1");
p.check("포트폴리오 원본이 만든 해시를 우리가 확인한다", await verifyPassword("포트폴리오 비번 1", pfHash), true);
p.check("포트폴리오 해시 파라미터 = 2^14/8/5", (({ N, r, p: pp }) => [N, r, pp])(parseHash(pfHash)!), [16384, 8, 5]);
const ours = await hashPassword("새 비번 2");
p.check("우리 기본 해시 = 2^17/8/1(OWASP scrypt 최소)", (({ N, r, p: pp }) => [N, r, pp])(parseHash(ours)!), [DEFAULT_SCRYPT.N, 8, 1]);
p.check("우리 해시를 포트폴리오 원본이 확인한다(형식 같음)", await pf.password.verifyPassword("새 비번 2", ours), true);
p.check("틀린 비밀번호 → false", await verifyPassword("새 비번 3", ours), false);
p.check("같은 비밀번호도 해시는 매번 다르다(salt)", (await hashPassword("새 비번 2")) === ours, false);
p.check("NFD 로 입력해도 같다(NFC 정규화)", await verifyPassword("새 비번 2".normalize("NFD"), ours), true);
p.check(`${MAX_PASSWORD_LENGTH + 1}자 → false(해시를 돌리지 않는다)`, await verifyPassword("a".repeat(MAX_PASSWORD_LENGTH + 1), ours), false);
p.check("빈 값·문자열 아님 → false", [await verifyPassword("", ours), await verifyPassword(null, ours), await verifyPassword(123, ours)], [false, false, false]);

const [a, N, r, pp, salt, key] = ours.split(":") as string[];
for (const [label, bad] of [
  ["알고리즘 다름", ["bcrypt", N, r, pp, salt, key]],
  ["N 이 2의 거듭제곱 아님", [a, "1000", r, pp, salt, key]],
  ["N 이 너무 커 메모리 폭주(2^22·8)", [a, String(2 ** 22), r, pp, salt, key]],
  ["p 가 너무 큼", [a, N, r, "64", salt, key]],
  ["키 길이 틀림", [a, N, r, pp, salt, key!.slice(0, 10)]],
  ["조각 수 많음", [a, N, r, pp, salt, key, "x"]],
  ["salt 비움", [a, N, r, pp, "", key]],
] as const) p.check(`깨진 저장값(${label}) → parseHash null · verify false`, [parseHash(bad.join(":")), await verifyPassword("새 비번 2", bad.join(":"))], [null, false]);
p.check("$ 로 펼쳐져 잘린 해시(셸 사고) → false", await verifyPassword("새 비번 2", ours.slice(0, 20)), false);

p.observe("확인 1번 — 2^17/8/1 (ms)", await timeIt(() => verifyPassword("새 비번 2", ours), 5));
p.observe("확인 1번 — 2^14/8/5 포트폴리오 (ms)", await timeIt(() => verifyPassword("포트폴리오 비번 1", pfHash), 5));
{
  const before = process.memoryUsage().rss;
  let peak = before;
  const t = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  await Promise.all(Array.from({ length: 4 }, () => verifyPassword("틀림", ours)));
  clearInterval(t);
  p.observe("동시 4번 확인 — RSS 증가(MiB, 2^17)", Math.round((peak - before) / 1048576));
}
p.finish();
