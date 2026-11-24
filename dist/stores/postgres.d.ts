import type { ThrottleStore } from "../throttle.ts";
export type Queryable = {
    query: (sql: string, args?: unknown[]) => Promise<{
        rows: unknown[];
    }>;
};
/** 표 만들기 SQL — 앱이 자기 스키마 초기화에 그대로 넣어도 된다 */
export declare function postgresStoreDDL(table?: string): string[];
export declare function postgresStore(db: Queryable, opts?: {
    table?: string;
}): ThrottleStore & {
    ensureTable(): Promise<void>;
};
