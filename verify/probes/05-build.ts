// 실측 05 — 빌드 결과(dist): 미리 빌드한 JS + .d.ts 를 낸다(앱마다 transpilePackages 없이 — Next 는 node_modules 의 TS 를 컴파일하지 않는다).
// 'use client' 가 react.js 맨 앞에 남는가 · 상대 import 가 .js 로 바뀌었나 · 하위 경로 exports 가 풀리나 · CLI.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createProbe } from "../lib/probe.ts";

const p = createProbe("05-build");
const ROOT = join(import.meta.dirname, "..", "..");
execFileSync("npm", ["run", "-s", "build"], { cwd: ROOT, stdio: "inherit" });
const dist = (f: string) => join(ROOT, "dist", f);

const files = ["index.js", "index.d.ts", "next.js", "next.d.ts", "react.js", "react.d.ts", "stores/postgres.js", "stores/postgres.d.ts", "cli.js", "gate.js", "token.js", "password.js", "throttle.js"];
p.check("dist 파일이 다 있다", files.filter((f) => !existsSync(dist(f))), []);
p.check("react.js 맨 앞이 'use client'", readFileSync(dist("react.js"), "utf8").trimStart().startsWith('"use client"'), true);
p.check("상대 import 에 .ts 가 남지 않는다", files.filter((f) => f.endsWith(".js") && /from "\.{1,2}\/[^"]+\.ts"/.test(readFileSync(dist(f), "utf8"))), []);
p.check("cli.js 맨 앞이 #! 이고 실행 권한", [readFileSync(dist("cli.js"), "utf8").startsWith("#!/usr/bin/env node"), (execFileSync("stat", ["-f", "%Lp", dist("cli.js")], { encoding: "utf8" }).trim())], [true, "755"]);

// 패키지 이름으로 import(자기 참조 — exports 표를 그대로 탄다)
const sub = (spec: string) => spawnSync(process.execPath, ["--input-type=module", "-e", `const m = await import(${JSON.stringify(spec)}); console.log(Object.keys(m).sort().join(","))`], { cwd: ROOT, encoding: "utf8" });
const core = sub("@iyeaaa/page-gate");
p.check("import '@iyeaaa/page-gate'", core.stdout.trim(), (v: string) => ["createGate", "gateFromEnv", "hashPassword", "memoryStore", "safeNext", "verifyToken"].every((k) => v.split(",").includes(k)));
p.check("import '@iyeaaa/page-gate/stores/postgres'", sub("@iyeaaa/page-gate/stores/postgres").stdout.trim(), "postgresStore,postgresStoreDDL");
// next 는 맨 이름으로(next/headers) — `.js` 를 붙이면 Next 번들러의 내부 연결을 못 타 Route Handler 빌드가 실패했다(docs 실측 22).
// 그래서 /next 는 Node 로 직접 import 하지 않고(Node ESM 은 확장자 없는 next/headers 를 못 푼다 — Next 안에서만 쓰는 하위 경로) 모양만 본다.
p.check("dist/next.js 의 next import 가 맨 이름", [...readFileSync(dist("next.js"), "utf8").matchAll(/from "(next\/[^"]+)"/g)].map((m) => m[1]).sort(), ["next/headers", "next/navigation", "next/server"]);
p.check("next.d.ts 가 내보내는 이름", [...readFileSync(dist("next.d.ts"), "utf8").matchAll(/export (?:declare )?(?:function|const) (\w+)/g)].map((m) => m[1]).sort(), ["DEFAULT_MESSAGES", "gateProxy", "isRequestUnlocked", "lockAndRedirect", "unlockFromForm"]);
p.check("없는 하위 경로는 막힌다(dist 내부 노출 안 함)", sub("@iyeaaa/page-gate/token").status !== 0, true);

// CLI
const cli = (args: string[], input?: string, env: Record<string, string> = {}) => spawnSync(process.execPath, [dist("cli.js"), ...args], { input, encoding: "utf8", env: { ...process.env, ...env } });
p.check("page-gate secret → 43자 base64url", /^[A-Za-z0-9_-]{43}$/.test(cli(["secret"]).stdout.trim()), true);
const h = cli(["hash"], "파이프 비번\n").stdout.trim();
p.check("page-gate hash(파이프 입력) → scrypt 2^17/8/1 해시", h.startsWith("scrypt:131072:8:1:"), true);
const ok = cli(["check-env"], undefined, { PAGE_GATE_SECRET: "s".repeat(43), PAGE_GATE_PASSWORD_HASH: h });
p.check("check-env 맞으면 0 + 값은 찍지 않는다", [ok.status, ok.stdout.includes(h), ok.stdout.includes("s".repeat(43))], [0, false, false]);
p.check("check-env 깨진 해시 → 1", cli(["check-env"], undefined, { PAGE_GATE_SECRET: "s".repeat(43), PAGE_GATE_PASSWORD_HASH: h.slice(0, 20) }).status, 1);
p.finish();
