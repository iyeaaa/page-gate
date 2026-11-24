// 잠금 쿠키 값 = `v1.<만료 epoch 초>.<비밀번호 지문>.<HMAC>`. 서버에 세션 저장소가 없어도 위조·만료를 판단한다(상태 없는 세션 —
// Next.js authentication 가이드 «Stateless Sessions»).
// - 만료는 쿠키 maxAge 가 아니라 서명 안의 값으로 판단한다(OWASP Session Management: 만료는 서버가 강제). 쿠키를 손으로 늘려도 소용없다.
// - 지문 = 비밀번호 해시에서 뽑은 짧은 값. 비밀번호를 바꾸면 지문이 달라져 예전 쿠키가 전부 풀린다. 서명 키를 바꿔도 전부 풀린다.
// - 형식은 포트폴리오(yiye.in) src/lib/page-gate/token.ts 와 같다 — 옮겨도 기존 쿠키가 그대로 통한다. 바꾸면 메이저 버전.
// 실측 01.
import { createHmac, timingSafeEqual } from "node:crypto";
const VERSION = "v1";
const MAX_TOKEN_LENGTH = 200;
function hmac(secret, data) {
    return createHmac("sha256", secret).update(data).digest("base64url");
}
export function passwordFingerprint(secret, passwordHash) {
    return hmac(secret, `fp:${passwordHash}`).slice(0, 12);
}
export function signToken(secret, fingerprint, expiresAt) {
    const body = `${VERSION}.${expiresAt}.${fingerprint}`;
    return `${body}.${hmac(secret, body)}`;
}
export function verifyToken(token, secret, fingerprint, now = Date.now() / 1000) {
    if (!token || token.length > MAX_TOKEN_LENGTH)
        return false;
    const parts = token.split(".");
    if (parts.length !== 4)
        return false;
    const [version, exp, fp, sig] = parts;
    if (version !== VERSION || fp !== fingerprint)
        return false;
    const expiresAt = Number(exp);
    if (!Number.isInteger(expiresAt) || expiresAt <= now)
        return false;
    const expected = Buffer.from(hmac(secret, `${version}.${exp}.${fp}`));
    const given = Buffer.from(sig);
    // timingSafeEqual 은 길이가 다르면 예외를 던진다 — 먼저 걸러낸다(실측 01)
    return given.length === expected.length && timingSafeEqual(given, expected);
}
