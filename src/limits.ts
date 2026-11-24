// 서버·브라우저가 같이 쓰는 한도(node:crypto 를 끌고 오지 않게 따로 — 폼(react.tsx)이 import 한다).
/** OWASP: 비밀번호 입력 길이 상한(긴 입력으로 해시를 오래 돌리게 하는 걸 막는다) */
export const MAX_PASSWORD_LENGTH = 256;
/** 쿠키 서명 키 최소 길이 */
export const MIN_SECRET_LENGTH = 32;
