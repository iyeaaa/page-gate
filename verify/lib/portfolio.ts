// 포트폴리오(yiye.in) 레포의 page-gate 원본을 그대로 꺼내 온다 — «옮겨도 기존 쿠키·해시가 통하나»를 원본 코드와 직접 견준다(실측 01·02).
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.env.PORTFOLIO_REPO ?? join(process.env.HOME!, "Personal/Portfolio/site");

export async function loadPortfolioGate(ref = "origin/main") {
  const dir = mkdtempSync(join(tmpdir(), "pf-gate-"));
  for (const f of ["token.ts", "password.ts"]) {
    writeFileSync(join(dir, f), execFileSync("git", ["-C", REPO, "show", `${ref}:src/lib/page-gate/${f}`], { encoding: "utf8" }));
  }
  return {
    token: await import(join(dir, "token.ts")) as typeof import("../../src/token.ts"),
    password: await import(join(dir, "password.ts")) as { hashPassword(p: string): Promise<string>; verifyPassword(p: string, s: string): Promise<boolean> },
  };
}
