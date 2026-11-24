// 비밀번호 해시 = `scrypt:<N>:<r>:<p>:<salt b64url>:<hash b64url>`. 파라미터가 해시 안에 있어 사이트마다 달라도 확인 코드는 하나다.
// - 새 해시 기본값 N=2^17 r=8 p=1 = OWASP Password Storage Cheat Sheet 의 scrypt 최소 권장(해시 한 번 약 128MiB).
//   포트폴리오의 2^14/8/5 해시도 그대로 확인된다(같은 형식).
// - 구분자가 `$` 가 아닌 이유: .env 로더·compose·셸이 `$이름` 을 변수로 펼쳐 해시가 깨졌다(포트폴리오 실측).
// - 저장값이 깨졌거나 파라미터가 터무니없으면(메모리 폭주) 조용히 «틀림» — 잠금은 늘 닫힌 쪽으로 실패한다.
// 실측 02.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { MAX_PASSWORD_LENGTH } from "./limits.ts";

export const DEFAULT_SCRYPT = { N: 2 ** 17, r: 8, p: 1 } as const;
const KEY_LEN = 32;
export { MAX_PASSWORD_LENGTH };
/** 저장값이 요구할 수 있는 최대 메모리(128·N·r 바이트). 넘으면 깨진 값으로 본다 */
const MAX_MEMORY = 512 * 1024 * 1024;

function derive(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFC"), salt, KEY_LEN, { N, r, p, maxmem: 256 * N * r }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string, params: { N: number; r: number; p: number } = DEFAULT_SCRYPT): Promise<string> {
  if (!password || password.length > MAX_PASSWORD_LENGTH) throw new Error(`비밀번호는 1~${MAX_PASSWORD_LENGTH}자`);
  const salt = randomBytes(16);
  const key = await derive(password, salt, params.N, params.r, params.p);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

/** 저장된 해시 모양이 맞는지(비밀번호는 보지 않는다) — 설정 확인용 */
export function parseHash(stored: unknown): { N: number; r: number; p: number; salt: Buffer; key: Buffer } | null {
  if (typeof stored !== "string") return null;
  const [algo, n, r, p, saltB64, keyB64, ...rest] = stored.split(":");
  const N = Number(n), R = Number(r), P = Number(p);
  if (algo !== "scrypt" || rest.length || !saltB64 || !keyB64 || ![N, R, P].every((x) => Number.isInteger(x) && x > 0)) return null;
  if ((N & (N - 1)) !== 0 || N < 2 || 128 * N * R > MAX_MEMORY || P > 16) return null;
  const key = Buffer.from(keyB64, "base64url");
  return key.length === KEY_LEN ? { N, r: R, p: P, salt: Buffer.from(saltB64, "base64url"), key } : null;
}

export async function verifyPassword(password: unknown, stored: string): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return false;
  const h = parseHash(stored);
  if (!h) return false;
  try {
    return timingSafeEqual(await derive(password, h.salt, h.N, h.r, h.p), h.key);
  } catch {
    return false;
  }
}
