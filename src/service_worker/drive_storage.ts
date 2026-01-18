import {mapObject} from "@/common.ts";

// -----------------------------------------------------------------------------
// Types & Interfaces
// -----------------------------------------------------------------------------
interface StorageValue<T> {
    [key: string]: T;
}

interface LocalItemEnvelope<T = any> {
    timestamp: number;
    data: T;
}

type DriveSyncMetadata = {
    key: string;
    timestamp: number;
    deleted?: boolean;
}

interface DriveQueueItem {
    action: 'SET' | 'REMOVE';
    key: string;
    value?: unknown;
    timestamp: number;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const DRIVE_STORAGE_NAMESPACE = '_drive';
const DRIVE_STORAGE_LOCAL_ITEM_PREFIX = `${DRIVE_STORAGE_NAMESPACE}:item:`;
const DRIVE_STORAGE_LOCAL_QUEUE_KEY = `${DRIVE_STORAGE_NAMESPACE}:queue`;
const DRIVE_STORAGE_SYNC_META_PREFIX = `${DRIVE_STORAGE_NAMESPACE}:meta:`;

// -----------------------------------------------------------------------------
// Google Drive API Helpers
// -----------------------------------------------------------------------------
const drive = {
    async getAuthToken(): Promise<string> {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({interactive: true}, (token) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(token as string);
                }
            });
        });
    },

    async getFileId(fileName: string, token: string): Promise<string | null> {
        const url = new URL('https://www.googleapis.com/drive/v3/files');
        url.searchParams.append('q', `name = '${fileName}' and 'appDataFolder' in parents and trashed = false`);
        url.searchParams.append('fields', 'files(id)');
        url.searchParams.append('spaces', 'appDataFolder');

        const response = await fetch(url, {
            headers: {'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) return null;
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    },

    async upload(fileName: string, data: unknown) {
        const token = await this.getAuthToken();

        const fileContent = new Blob([JSON.stringify(data)], {type: 'application/json'});

        let fileId = await this.getFileId(fileName, token);
        if (fileId) {
            const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': fileContent.type,
                    'Content-Length': fileContent.size.toString(),
                },
                body: fileContent,
            });

            if (!response.ok) throw new Error(`Drive upload failed: ${response.statusText}`);
        } else {
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify({
                    parents: ['appDataFolder'],
                    name: fileName,
                    mimeType: fileContent.type,
                })], {type: 'application/json'},
            ));
            form.append('file', fileContent);

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: form
            });

            if (!response.ok) throw new Error(`Drive upload failed: ${response.statusText}`);

            const result = await response.json();
            fileId = result.id;
            if (!fileId) throw new Error('Drive upload failed: Missing file ID in response');
        }

        return fileId;
    },

    async download(fileName: string): Promise<unknown> {
        const token = await this.getAuthToken();

        let fileId = await this.getFileId(fileName, token);
        if (!fileId) return null;

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });

        if (!response.ok) throw new Error(`Drive download failed: ${response.statusText}`);
        return await response.json();
    },

    async delete(fileName: string) {
        const token = await this.getAuthToken();

        const fileId = await this.getFileId(fileName, token);
        if (fileId) {
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                method: 'DELETE',
                headers: {'Authorization': `Bearer ${token}`},
            });
        }
    },
};

// -----------------------------------------------------------------------------
// DriveStorageService Class
// -----------------------------------------------------------------------------
export class DriveStorage {
    private isSyncing = false;

    constructor() {
        this.setupListeners();
        // Attempt to clear any pending queue on startup
        // noinspection JSIgnoredPromiseFromCall
        this.processSyncQueue();
    }

    private setupListeners() {
        chrome.storage.sync.onChanged.addListener(this.handleSyncStorageChanges);

        self.addEventListener('online', () => this.processSyncQueue());
    }

    // -------------------------------------------------------------------------
    // Public API (Mimics chrome.storage)
    // -------------------------------------------------------------------------

    /**
     * Sets items to local cache and queues them for Drive sync.
     * Works offline.
     */
    async set<T extends Record<string, unknown> = Record<string, unknown>>(items: Partial<T>): Promise<void> {
        const timestamp = Date.now();

        const wrappedItems = mapObject(items, ([key, value]) => [
            DRIVE_STORAGE_LOCAL_ITEM_PREFIX + key,
            {
                timestamp: timestamp,
                data: value,
            } satisfies LocalItemEnvelope,
        ]);
        await chrome.storage.local.set<Record<string, LocalItemEnvelope>>(wrappedItems);

        await this.addToSyncQueue(Object.entries(items).map(([key, value]) => ({
            timestamp: timestamp,
            action: 'SET',
            key: key,
            value: value,
        })));
        // noinspection ES6MissingAwait
        this.processSyncQueue();
    }

    /**
     * Retrieves items from local cache.
     * If data is missing locally but exists in sync metadata, it triggers a fetch in background.
     */
    async get<T>(keys?: string | string[] | null): Promise<StorageValue<T>> {
        if (typeof keys === 'string') {
            keys = [keys];
        }

        const wrappedKeys = keys?.map(key => DRIVE_STORAGE_LOCAL_ITEM_PREFIX + key);
        const wrappedItems = await chrome.storage.local.get<Record<string, LocalItemEnvelope<T>>>(wrappedKeys);
        return mapObject(wrappedItems, ([key, value]) => [
            key.substring(DRIVE_STORAGE_LOCAL_ITEM_PREFIX.length),
            (value as LocalItemEnvelope<T>).data,
        ]);
    }

    /**
     * Removes items from local cache and queues deletion for Drive.
     */
    async remove(keys: string | string[]): Promise<void> {
        const timestamp = Date.now();

        if (typeof keys === 'string') {
            keys = [keys];
        }
        const wrappedKeys = keys?.map(key => DRIVE_STORAGE_LOCAL_ITEM_PREFIX + key);
        await chrome.storage.local.remove(wrappedKeys);

        await this.addToSyncQueue(keys.map((key) => ({
            action: 'REMOVE',
            timestamp,
            key,
        })));
        // noinspection ES6MissingAwait
        this.processSyncQueue();
    }

    /**
     * Custom Event Listener for changes.
     * This effectively wraps chrome.storage.onChanged but allows you to differentiate
     * between local updates and incoming cloud syncs if needed.
     */
    get onChanged() {
        return {
            addListener: (callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void) => {
                chrome.storage.local.onChanged.addListener((changes) => {
                    const actualChangeEntries = Object.entries(changes)
                        .filter(([key]) => key.startsWith(DRIVE_STORAGE_LOCAL_ITEM_PREFIX))
                        .map(([key, change]) => [
                            key.substring(DRIVE_STORAGE_LOCAL_ITEM_PREFIX.length),
                            {
                                oldValue: (change.oldValue as LocalItemEnvelope)?.data,
                                newValue: (change.newValue as LocalItemEnvelope)?.data,
                            },
                        ]);

                    if (actualChangeEntries.length > 0) {
                        callback(Object.fromEntries(actualChangeEntries));
                    }
                });
            }
        };
    }

    // -------------------------------------------------------------------------
    // Sync Logic (The Heavy Lifting)
    // -------------------------------------------------------------------------

    private async addToSyncQueue(items: DriveQueueItem[]) {
        const currentQueueData = await chrome.storage.local.get<Record<string, DriveQueueItem[]>>(DRIVE_STORAGE_LOCAL_QUEUE_KEY);
        const queue = currentQueueData[DRIVE_STORAGE_LOCAL_QUEUE_KEY] || [];

        // Deduplicate: If a key is already in the queue, update it to the newest action
        items.forEach(newItem => {
            const existingIndex = queue.findIndex(q => q.key === newItem.key);
            if (existingIndex > -1) {
                queue[existingIndex] = newItem;
            } else {
                queue.push(newItem);
            }
        });

        await chrome.storage.local.set({[DRIVE_STORAGE_LOCAL_QUEUE_KEY]: queue});
    }

    private async processSyncQueue() {
        if (this.isSyncing || !navigator.onLine) return;

        try {
            this.isSyncing = true;
            const queue = await chrome.storage.local.get<Record<string, DriveQueueItem[]>>(DRIVE_STORAGE_LOCAL_QUEUE_KEY)
                .then(data => data[DRIVE_STORAGE_LOCAL_QUEUE_KEY] || []);

            if (queue.length === 0) {
                this.isSyncing = false;
                return;
            }

            // Process one item at a time (FIFO)
            const item = queue[0];

            switch (item.action) {
                case 'SET':
                    await drive.upload(item.key, item.value);
                    await chrome.storage.sync.set<Record<string, DriveSyncMetadata>>({
                        [`${DRIVE_STORAGE_SYNC_META_PREFIX}${item.key}`]: {
                            key: item.key,
                            timestamp: item.timestamp,
                        },
                    });
                    break;
                case 'REMOVE':
                    await drive.delete(item.key);
                    await chrome.storage.sync.set<Record<string, DriveSyncMetadata>>({
                        [`${DRIVE_STORAGE_SYNC_META_PREFIX}${item.key}`]: {
                            key: item.key,
                            timestamp: item.timestamp,
                            deleted: true,
                        },
                    });
                    break;
                default:
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error(`Unknown action type: ${item.action}`);
            }

            // Success: Remove from queue
            const remaining = queue.slice(1);
            await chrome.storage.local.set<Record<string, DriveQueueItem[]>>({[DRIVE_STORAGE_LOCAL_QUEUE_KEY]: remaining});

            // Loop immediately to process next
            this.isSyncing = false;
            // noinspection ES6MissingAwait
            this.processSyncQueue();
        } catch (error) {
            console.error('SYNC:', 'Queue processing failed', error);
            this.isSyncing = false;
        }
    }

    private async handleSyncStorageChanges(changes: Record<string, chrome.storage.StorageChange>) {
        for (const [key, change] of Object.entries(changes)) {
            if (key.startsWith(DRIVE_STORAGE_SYNC_META_PREFIX)) {
                if (change.newValue) {
                    const newMetadata = change.newValue as DriveSyncMetadata;
                    const localKey = DRIVE_STORAGE_LOCAL_ITEM_PREFIX + newMetadata.key;
                    const localItem = await chrome.storage.local.get<Record<string, LocalItemEnvelope>>(localKey)
                        .then(items => items[localKey]);

                    if (!localItem || newMetadata.timestamp > localItem.timestamp) {
                        if (newMetadata.deleted) {
                            if (localItem) {
                                await chrome.storage.local.remove(localKey);
                            }
                        } else {
                            const token = await drive.getAuthToken();
                            if (!token) {
                                console.error('SYNC:', 'Missing auth token for Drive download');
                            } else {
                                const content = await drive.download(newMetadata.key);
                                if (!content) {
                                    console.error('SYNC:', 'File not found on Drive', newMetadata.key);
                                } else {
                                    const wrappedItem = {
                                        [localKey]: {
                                            timestamp: newMetadata.timestamp,
                                            data: content,
                                        } satisfies LocalItemEnvelope
                                    };
                                    await chrome.storage.local.set<Record<string, LocalItemEnvelope>>(wrappedItem);
                                }
                            }
                        }
                    }
                } else {
                    const oldMetadata = change.oldValue as DriveSyncMetadata;
                    const localKey = DRIVE_STORAGE_LOCAL_ITEM_PREFIX + oldMetadata.key;
                    await chrome.storage.local.remove(localKey);
                }
            }
        }
    }
}

// -----------------------------------------------------------------------------
// Export Singleton
// -----------------------------------------------------------------------------
export const driveStorage = new DriveStorage();

