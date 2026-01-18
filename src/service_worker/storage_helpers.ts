/**
 * Chrome Storage Helper Module
 * 
 * Provides utilities for working with Chrome storage APIs (local, sync, session).
 * Handles storage key management and sync storage wrapping/unwrapping.
 */

import ExtensionInfo from "@/extension.ts";

type StorageArea = chrome.storage.StorageArea;
type StorageChange = chrome.storage.StorageChange;

// Storage namespace configuration
const storageNamespaceSeparator = '::';
const userScriptStorageNamespace = 'userscripts';
const userScriptMetaStorageNamespace = 'userscripts-meta';

export const userScriptStorageKeyPrefix = userScriptStorageNamespace + storageNamespaceSeparator;
export const userScriptMetaStorageKeyPrefix = userScriptMetaStorageNamespace + storageNamespaceSeparator;

export const userScriptStorageKey = (scriptId: string) => userScriptStorageKeyPrefix + scriptId;
export const userScriptStorageMetaKey = (scriptId: string) => userScriptMetaStorageKeyPrefix + scriptId;

// Sync storage wrapper types
type SyncStorageEntry = {
    origin: string,
    payload: any,
}

export function wrapSyncStorageEntry(payload: any): SyncStorageEntry {
    return {
        origin: ExtensionInfo.installationId,
        payload,
    }
}

export function unwrapSyncStorageEntry<T>(entry: SyncStorageEntry): T {
    return entry.payload as T;
}

export function isLocalSyncStorageChange(change: StorageChange): boolean {
    return (change.newValue as SyncStorageEntry)?.origin === ExtensionInfo.installationId
        || (!change.newValue && (change.oldValue as SyncStorageEntry)?.origin === ExtensionInfo.installationId);
}

// Storage operations
export async function getStorageItem<T>(storage: StorageArea, key: string): Promise<T | undefined> {
    return storage.get(key)
        .then((data) => data?.[key])
        .then((value) => {
            if (storage === chrome.storage.sync && value) {
                return unwrapSyncStorageEntry<T>(value);
            }
            return value as T | undefined;
        })
}

export async function setStorageItem<T>(storage: StorageArea, key: string, value: T): Promise<void> {
    if (storage === chrome.storage.sync) {
        value = wrapSyncStorageEntry(value) as unknown as T;
        console.log('Saving to sync storage key:', key, 'value:', value);
    }

    return storage.set({[key]: value});
}

// Hash utility
export async function calculateHash(content: string): Promise<string> {
    if (content === undefined) {
        throw new Error('Content is undefined');
    }
    return await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(content))
        .then((buffer => new Uint8Array(buffer).toBase64({urlSafe: false, omitPadding: false})))
}
