export declare function passwordFingerprint(secret: string, passwordHash: string): string;
export declare function signToken(secret: string, fingerprint: string, expiresAt: number): string;
export declare function verifyToken(token: string | undefined, secret: string, fingerprint: string, now?: number): boolean;
