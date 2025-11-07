export const storageOrigin = crypto.randomUUID();

export type StorageEntry = {
    _origin: string;
    data: any;
};

export function createStorageEntry(data: any): StorageEntry {
    return {
        _origin: storageOrigin,
        data,
    };
}

export function isLocalStorageEntry(entry: StorageEntry) {
    return entry?._origin === storageOrigin;
}

export const storageNamespaceSeparator = `::`;

export function getStorageEntryKey(namespace: string, key: string): string {
    return namespace + storageNamespaceSeparator + key;
}

export function getStorageEntryNamespace(key: string): string | undefined {
    if (key.includes(storageNamespaceSeparator)) {
        return key.split(storageNamespaceSeparator)[0];
    }
}

