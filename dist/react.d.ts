import type { UnlockState } from "./next.ts";
export type UnlockFormProps = {
    action: (prev: UnlockState, formData: FormData) => Promise<UnlockState>;
    next: string;
    labels?: {
        password?: string;
        submit?: string;
        pending?: string;
    };
    classNames?: {
        form?: string;
        label?: string;
        input?: string;
        error?: string;
        button?: string;
    };
};
export declare function UnlockForm({ action, next, labels, classNames }: UnlockFormProps): import("react").JSX.Element;
