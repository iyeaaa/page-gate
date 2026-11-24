"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// 잠금 화면의 폼(스타일 없음 — 사이트마다 classNames 로 입힌다). action 은 앱의 'use server' 함수(unlockFromForm 을 부르는).
// JS 가 꺼져 있어도 일반 폼 제출로 동작한다(useActionState + form action).
import { useActionState, useId } from "react";
import { MAX_PASSWORD_LENGTH } from "./limits.js";
export function UnlockForm({ action, next, labels = {}, classNames = {} }) {
    const [state, formAction, pending] = useActionState(action, {});
    const id = useId(); // 한 화면에 폼이 둘이어도 label·오류 연결이 겹치지 않게
    return (_jsxs("form", { action: formAction, className: classNames.form, children: [_jsx("input", { type: "hidden", name: "next", value: next }), _jsx("label", { htmlFor: `${id}-password`, className: classNames.label, children: labels.password ?? "비밀번호" }), _jsx("input", { id: `${id}-password`, name: "password", type: "password", autoComplete: "current-password", required: true, maxLength: MAX_PASSWORD_LENGTH, autoFocus: true, 
                // 비밀번호 관리 확장이 hydration 전에 autocomplete 를 바꿔 경고가 났다(포트폴리오 실측) — 이 칸의 속성 차이만 무시
                suppressHydrationWarning: true, "aria-invalid": !!state.error, "aria-describedby": state.error ? `${id}-error` : undefined, className: classNames.input }), state.error ? _jsx("p", { id: `${id}-error`, role: "alert", className: classNames.error, children: state.error }) : null, _jsx("button", { type: "submit", disabled: pending, className: classNames.button, children: pending ? (labels.pending ?? "확인 중…") : (labels.submit ?? "열기") })] }));
}
