import { MAX_PASSWORD_LENGTH } from "./limits.ts";
export declare const DEFAULT_SCRYPT: {
    readonly N: number;
    readonly r: 8;
    readonly p: 1;
};
export { MAX_PASSWORD_LENGTH };
export declare function hashPassword(password: string, params?: {
    N: number;
    r: number;
    p: number;
}): Promise<string>;
/** 저장된 해시 모양이 맞는지(비밀번호는 보지 않는다) — 설정 확인용 */
export declare function parseHash(stored: unknown): {
    N: number;
    r: number;
    p: number;
    salt: Buffer;
    key: Buffer;
} | null;
export declare function verifyPassword(password: unknown, stored: string): Promise<boolean>;
