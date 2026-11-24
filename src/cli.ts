#!/usr/bin/env node
// page-gate hash        입력을 숨긴 채 두 번 묻고 → PAGE_GATE_PASSWORD_HASH 값 한 줄(평문은 어디에도 남기지 않는다)
// page-gate secret      → PAGE_GATE_SECRET 값(32바이트 무작위, base64url)
// page-gate check-env   지금 환경의 PAGE_GATE_* 모양만 본다(값은 찍지 않는다). --prefix NAME 로 다른 접두어
import { randomBytes } from "node:crypto";
import { MIN_SECRET_LENGTH } from "./limits.ts";
import { hashPassword, parseHash } from "./password.ts";

async function readHidden(prompt: string): Promise<string> {
  const { stdin, stderr } = process;
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] ?? "";
  }
  stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve) => {
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stderr.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "secret") {
  console.log(randomBytes(32).toString("base64url"));
} else if (cmd === "hash") {
  const first = await readHidden("비밀번호: ");
  if (process.stdin.isTTY && (await readHidden("한 번 더: ")) !== first) {
    console.error("✗ 두 번 입력이 다르다");
    process.exit(1);
  }
  if (!first) {
    console.error("✗ 빈 비밀번호");
    process.exit(1);
  }
  console.log(await hashPassword(first));
} else if (cmd === "check-env") {
  const i = args.indexOf("--prefix");
  const prefix = i >= 0 ? args[i + 1] : "PAGE_GATE";
  const secret = process.env[`${prefix}_SECRET`];
  const hash = parseHash(process.env[`${prefix}_PASSWORD_HASH`]);
  console.log(`${prefix}_SECRET: ${!secret ? "✗ 없음" : secret.length < MIN_SECRET_LENGTH ? `✗ ${secret.length}자(${MIN_SECRET_LENGTH}자 이상)` : `✓ ${secret.length}자`}`);
  console.log(`${prefix}_PASSWORD_HASH: ${hash ? `✓ scrypt N=${hash.N} r=${hash.r} p=${hash.p}` : "✗ 없거나 형식이 깨짐(셸·.env 가 $ 를 펼쳤는지 확인)"}`);
  process.exit(secret && secret.length >= MIN_SECRET_LENGTH && hash ? 0 : 1);
} else {
  console.error("사용: page-gate hash | page-gate secret | page-gate check-env [--prefix NAME]");
  process.exit(cmd ? 1 : 0);
}
