// Next.js(16+) 연결. proxy 는 빠른 1차 관문일 뿐 — 페이지·Route Handler 안에서도 다시 확인한다
// (Next.js authentication 가이드: proxy 는 «optimistic check», 보안 검사는 데이터 가까이).
// Server Action 은 앱 쪽 'use server' 파일에서 unlockFromForm·lockAndRedirect 를 부른다(패키지가 'use server' 를 내보내면
// 앱마다 다른 gate 를 넘길 수 없다). ⚠️ Server Action 은 proxy 를 거치지 않을 수 있다(잠그지 않은 경로로 POST) — 앱의 다른 Action 도 각자 isRequestUnlocked 로 확인한다.
// next 는 확장자 없는 맨 이름으로 부른다(next/headers): Next 번들러는 맨 이름에만 내부 연결(alias)을 건다 — `next/navigation.js` 로 부르면
// Route Handler 빌드가 «app-router-context.js 를 못 찾음»으로 실패했다(docs 실측 22). 그래서 타입 해석도 Bundler 기준(tsconfig).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { safeNext } from "./gate.js";
const NO_STORE = "private, no-store";
/** proxy.ts 에서. 막아야 하면 응답(잠금 화면으로 307 또는 API 면 401), 지나가도 되면 null */
export function gateProxy(gate, req, opts = {}) {
    const { pathname, search } = req.nextUrl;
    if (!gate.isProtected(pathname) || gate.isUnlocked(req.cookies.get(gate.cookieName)?.value))
        return null;
    if (opts.isApi?.(pathname)) {
        return NextResponse.json({ error: "locked" }, { status: 401, headers: { "cache-control": NO_STORE } });
    }
    const url = req.nextUrl.clone();
    url.pathname = gate.unlockPath;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    res.headers.set("cache-control", NO_STORE);
    return res;
}
/** 서버 컴포넌트·Route Handler·Server Action 안에서 지금 요청이 풀린 상태인지 */
export async function isRequestUnlocked(gate) {
    return gate.isUnlocked((await cookies()).get(gate.cookieName)?.value);
}
async function setCookie(spec) {
    (await cookies()).set(spec.name, spec.value, spec.options);
}
export const DEFAULT_MESSAGES = {
    closed: "지금은 열 수 없어요.",
    busy: "지금 확인이 밀려 있어요. 잠시 뒤에 다시 해 주세요.",
    wrong: "비밀번호가 맞지 않아요.",
    blocked: (minutes) => `너무 많이 틀렸어요. ${minutes}분 뒤에 다시 해 주세요.`,
};
/** 앱의 'use server' 함수 안에서: `export async function unlock(prev, fd) { return unlockFromForm(gate, fd) }`.
 *  맞으면 쿠키를 주고 next 로 이동(redirect 는 예외로 흐름을 끊는다), 아니면 화면에 보일 메시지.
 *  다른 출처의 POST 는 Next 가 Origin·Host 비교로 먼저 막는다(로그인 CSRF — Next data-security, docs 실측 22). */
export async function unlockFromForm(gate, formData, messages = {}) {
    const m = { ...DEFAULT_MESSAGES, ...messages };
    const r = await gate.attempt(formData.get("password"));
    if (r.ok) {
        await setCookie(gate.issueCookie());
        return redirect(safeNext(formData.get("next")));
    }
    if (r.reason === "blocked")
        return { error: m.blocked(Math.ceil(r.retryAfterMs / 60_000)) };
    return { error: m[r.reason] };
}
export async function lockAndRedirect(gate, to = "/") {
    await setCookie(gate.clearCookie());
    return redirect(to);
}
