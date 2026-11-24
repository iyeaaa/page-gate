export type ThrottleRule = {
    limit: number;
    windowMs: number;
};
export declare const DEFAULT_THROTTLE: ThrottleRule;
export type HitResult = {
    allowed: true;
} | {
    allowed: false;
    retryAfterMs: number;
};
export type ThrottleStore = {
    /** 시도 한 번. 최근 windowMs 안 기록이 limit 보다 적으면 기록하고 allowed, 아니면 기록하지 않고 남은 시간 */
    hit(key: string, rule: ThrottleRule): Promise<HitResult>;
    /** 성공하면 그 key 의 기록을 지운다 */
    reset(key: string): Promise<void>;
};
/** 프로세스 하나 안에서만 센다. 서버리스에서는 쓰지 않는다 */
export declare function memoryStore(now?: () => number): ThrottleStore;
