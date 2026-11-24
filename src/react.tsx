"use client";
// 잠금 화면의 폼(스타일 없음 — 사이트마다 classNames 로 입힌다). action 은 앱의 'use server' 함수(unlockFromForm 을 부르는).
// JS 가 꺼져 있어도 일반 폼 제출로 동작한다(useActionState + form action).
import { useActionState, useId } from "react";
import { MAX_PASSWORD_LENGTH } from "./limits.ts";
import type { UnlockState } from "./next.ts";

export type UnlockFormProps = {
  action: (prev: UnlockState, formData: FormData) => Promise<UnlockState>;
  next: string;
  labels?: { password?: string; submit?: string; pending?: string };
  classNames?: { form?: string; label?: string; input?: string; error?: string; button?: string };
};

export function UnlockForm({ action, next, labels = {}, classNames = {} }: UnlockFormProps) {
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(action, {});
  const id = useId(); // 한 화면에 폼이 둘이어도 label·오류 연결이 겹치지 않게
  return (
    <form action={formAction} className={classNames.form}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor={`${id}-password`} className={classNames.label}>{labels.password ?? "비밀번호"}</label>
      <input
        id={`${id}-password`}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={MAX_PASSWORD_LENGTH}
        autoFocus
        // 비밀번호 관리 확장이 hydration 전에 autocomplete 를 바꿔 경고가 났다(포트폴리오 실측) — 이 칸의 속성 차이만 무시
        suppressHydrationWarning
        aria-invalid={!!state.error}
        aria-describedby={state.error ? `${id}-error` : undefined}
        className={classNames.input}
      />
      {state.error ? <p id={`${id}-error`} role="alert" className={classNames.error}>{state.error}</p> : null}
      <button type="submit" disabled={pending} className={classNames.button}>
        {pending ? (labels.pending ?? "확인 중…") : (labels.submit ?? "열기")}
      </button>
    </form>
  );
}
