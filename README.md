# @iyeaaa/page-gate

비밀번호 하나로 Next.js(16+) 사이트의 **고른 경로**를 잠근다. 계정·세션 DB 없이 서명 쿠키 하나로 동작한다.

- 쿠키 `__Host-page-gate` = `v1.<만료>.<비밀번호 지문>.<HMAC>` — 만료는 서명 안에서 서버가 판단, 비밀번호나 서명 키를 바꾸면 예전 쿠키가 전부 풀린다
- 비밀번호는 scrypt 해시로만(기본 N=2^17 r=8 p=1, OWASP 최소). 평문은 어디에도 두지 않는다
- 대입 제한: 기본 10분에 10번. **먼저 기록하고 그다음 비밀번호를 본다** — 동시에 몰아쳐도 한도를 넘지 못한다(실측 03: 동시 50번 → 정확히 한도만큼).
  저장소는 메모리(서버 한 대) 또는 Postgres(서버리스 — 인스턴스끼리 메모리를 나누지 않는다. key 마다 카운터 줄 하나, 남은 시간은 DB 시계)
- 비밀번호 확인(scrypt 2^17 = 한 번 128MiB)은 프로세스마다 동시 2개까지, 넘치면 «잠시 뒤에» — 메모리 폭주를 막는다
- 비밀번호가 하나라 누군가 일부러 계속 틀리면 그동안 주인도 못 연다(OWASP 가 경고하는 잠금 DoS, 창이 지나면 풀린다). 개인 페이지라 받아들인다
- 비밀값이 없거나 깨졌으면 잠긴 경로는 아무도 못 연다(닫힌 쪽으로 실패)
- 패키지에 비밀은 없다. 서명 키·해시는 각 사이트 환경 변수에만

## 설치

```sh
npm i https://github.com/iyeaaa/page-gate/archive/refs/tags/v1.0.0.tar.gz
npx page-gate secret          # → PAGE_GATE_SECRET (사이트마다 따로)
npx page-gate hash            # 입력을 숨긴 채 두 번 묻는다 → PAGE_GATE_PASSWORD_HASH
npx page-gate check-env       # 환경에 제대로 들어갔나(값은 안 찍는다)
```

태그 압축파일 주소로 설치한다: `github:` 단축형은 lockfile 에 `git+ssh://` 로 남아 SSH 키 없는 빌드 서버(Vercel 등)에서 실패할 수 있다(docs 실측). https 주소는 git 없이 받고 integrity 해시가 남는다.

해시 구분자는 `:` 다. `.env`·compose·셸이 `$` 를 펼쳐 해시가 깨지는 일이 없다.

## 쓰기 (Next.js 16, App Router)

**1. 잠금 정의** — `lib/gate.ts`

```ts
import { gateFromEnv } from "@iyeaaa/page-gate";
export const gate = gateFromEnv({ protect: ["/paper", "/private"] }); // 접두어 목록 또는 (pathname) => boolean
// 서버리스(Vercel 등)라면 비밀번호를 확인하는 곳(Server Action)에서만 대입 제한을 공유 저장소에 — proxy 묶음에 DB 를 끌고 오지 않게:
// import { postgresStore, postgresStoreDDL } from "@iyeaaa/page-gate/stores/postgres";
// export const unlockGate = gateFromEnv({ protect, store: postgresStore(pool) }); // pool = { query(sql, args) } 아무거나
// 표는 store.ensureTable() 또는 앱 스키마 초기화에 postgresStoreDDL()
```

**2. 1차 관문** — `proxy.ts`

```ts
import type { NextRequest } from "next/server";
import { gateProxy } from "@iyeaaa/page-gate/next";
import { gate } from "./lib/gate";
export function proxy(req: NextRequest) {
  return gateProxy(gate, req, { isApi: (p) => p.startsWith("/api/") }); // 막으면 /unlock?next=… 로(API 는 401), 아니면 null
}
```

**3. 페이지 안에서 다시 확인**(proxy 는 빠른 1차 관문일 뿐 — Next 공식 가이드)

```ts
import { isRequestUnlocked } from "@iyeaaa/page-gate/next";
if (!(await isRequestUnlocked(gate))) redirect(`/unlock?next=/paper`);
```

Server Action 은 잠그지 않은 경로로도 POST 될 수 있다(proxy 를 안 거친다). 잠긴 데이터를 다루는 Action 은 각자 `isRequestUnlocked` 로 확인한다.

**4. 잠금 화면** — `app/unlock/actions.ts` + `app/unlock/page.tsx`

```ts
"use server";
import { lockAndRedirect, unlockFromForm, type UnlockState } from "@iyeaaa/page-gate/next";
import { unlockGate } from "@/lib/gate";
export async function unlock(_: UnlockState, fd: FormData) { return unlockFromForm(unlockGate, fd /*, { wrong: "…" } 문구 일부만 바꾸기 */); }
export async function lock() { return lockAndRedirect(unlockGate, "/unlock"); }
```

```tsx
import { safeNext } from "@iyeaaa/page-gate";
import { UnlockForm } from "@iyeaaa/page-gate/react";
import { unlock } from "./actions";
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <UnlockForm action={unlock} next={safeNext((await searchParams).next)} classNames={{ input: "…", button: "…" }} />;
}
```

Server Action 은 POST 만 받고 Origin·Host 를 비교해 다른 출처를 막는다(Next 기본) — 로그인 CSRF 방어.

## 옵션

| 옵션 | 기본 | |
|---|---|---|
| `protect` | (필수) | 접두어 목록(`/paper` = `/paper` 와 `/paper/…`, `/paperx` 는 아님, 끝 슬래시 무시, `%`인코딩 경로도 잠금) 또는 함수. 잠금 화면 경로는 늘 제외 |
| `unlockPath` | `/unlock` | |
| `cookieName` | `__Host-page-gate` | 한 사이트에 잠금이 둘이면 다르게 |
| `ttlSeconds` | 7일 | |
| `store` | 메모리 | 서버리스면 `postgresStore` |
| `throttle` | `{ limit: 10, windowMs: 600000 }` | |
| `throttleKey` | 쿠키 이름 | 저장소(DB)를 같이 쓰는 사이트끼리 서로 잠그지 않게 |
| `maxConcurrentVerify` | 2 | 프로세스당 동시 비밀번호 확인 수 |
| `insecureDevCookie` | false | `http://localhost` 개발용(이름에서 `__Host-` 떼고 Secure 끔) |
| `envPrefix` (`gateFromEnv`) | `PAGE_GATE` | `<prefix>_SECRET`·`<prefix>_PASSWORD_HASH` |

## 실측

`npm run verify` — 01 토큰(포트폴리오 원본과 같은 쿠키) · 02 비밀번호(포트폴리오 해시 확인·시간·메모리) · 03 대입 제한(메모리·Postgres, 동시 50번·인스턴스 둘·DB 시계) · 04 잠금 흐름(경로·쿠키·열린 리다이렉트·동시 확인 제한) · 05 빌드(`dist`·`'use client'`·`next` 맨 이름 import·CLI).
앱에 붙인 HTTP 실측은 docs.yiye.in 레포의 `verify/probes/22-page-gate.ts`(풀기·다른 출처 POST·인스턴스 둘 동시 16번·다시 잠그기). Postgres 실측은 `TEST_DATABASE_URL`(기본 로컬 Docker `postgres://postgres:dg@127.0.0.1:55432/dg`).

## 릴리스

`npm run build` → `npm run verify` → `dist/` 커밋(설치할 때 빌드하지 않는다) → 태그 `vX.Y.Z` 푸시. 쿠키·해시 형식이 바뀌면 메이저.

⚠️ `next` 는 확장자 없는 맨 이름으로 import 한다(`next/headers`). `.js` 를 붙이면 Next 번들러의 내부 연결을 못 타 Route Handler 빌드가 실패한다(실측 05 가 지킨다).
