export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export function noop() {
}

export function mapObject<
    T extends Record<string, unknown>,
    KR extends string,
    VR
>(
    obj: T,
    fn: (entry: [string, unknown]) => [KR, VR],
): Record<KR, VR> {
    return Object.fromEntries(Object.entries(obj).map(fn)) as Record<KR, VR>;
}

export function _throw(error: Error | string): never {
    throw error;
}

export function determineIcon(iconOrMeta: string | { icon?: string; matches?: string[] } | undefined, matches?: string[]): string | undefined {
    // Handle direct icon string
    if (typeof iconOrMeta === 'string') {
        return iconOrMeta;
    }
    
    // Handle object with icon and matches
    if (iconOrMeta && typeof iconOrMeta === 'object') {
        if (iconOrMeta.icon) {
            return iconOrMeta.icon;
        }
        matches = iconOrMeta.matches;
    }
    
    // Fallback to favicon from matches
    const match = matches?.[0];
    if (match) {
        try {
            const matchHost = new URL(match).host;
            return 'https://www.google.com/s2/favicons?sz=64&domain=' + matchHost;
        } catch {
            // Invalid URL, return undefined
        }
    }
    return undefined;
}