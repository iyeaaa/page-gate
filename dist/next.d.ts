import { NextResponse, type NextRequest } from "next/server";
import { type Gate } from "./gate.ts";
/** proxy.ts 에서. 막아야 하면 응답(잠금 화면으로 307 또는 API 면 401), 지나가도 되면 null */
export declare function gateProxy(gate: Gate, req: NextRequest, opts?: {
    isApi?: (pathname: string) => boolean;
}): NextResponse | null;
/** 서버 컴포넌트·Route Handler·Server Action 안에서 지금 요청이 풀린 상태인지 */
export declare function isRequestUnlocked(gate: Gate): Promise<boolean>;
export type UnlockState = {
    error?: string;
};
export type UnlockMessages = {
    closed: string;
    busy: string;
    wrong: string;
    blocked: (minutes: number) => string;
};
export declare const DEFAULT_MESSAGES: UnlockMessages;
/** 앱의 'use server' 함수 안에서: `export async function unlock(prev, fd) { return unlockFromForm(gate, fd) }`.
 *  맞으면 쿠키를 주고 next 로 이동(redirect 는 예외로 흐름을 끊는다), 아니면 화면에 보일 메시지.
 *  다른 출처의 POST 는 Next 가 Origin·Host 비교로 먼저 막는다(로그인 CSRF — Next data-security, docs 실측 22). */
export declare function unlockFromForm(gate: Gate, formData: FormData, messages?: Partial<UnlockMessages>): Promise<UnlockState>;
export declare function lockAndRedirect(gate: Gate, to?: string): Promise<never>;
