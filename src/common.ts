export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export function noop() {
}

export function mapObject<
    T extends Record<any, any>,
    KR extends string,
    VR extends any
>(
    obj: T,
    fn: (entry: [string,  T[keyof T]]) => [KR, VR],
): Record<KR, VR> {
    return Object.fromEntries(Object.entries(obj).map(fn)) as Record<KR, VR>;
}

export function _throw(error: any): never {
    throw error;
}