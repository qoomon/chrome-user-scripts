import RegisteredUserScript = chrome.userScripts.RegisteredUserScript;
import RunAt = chrome.extensionTypes.RunAt;
import StorageChange = chrome.storage.StorageChange;
import StorageArea = chrome.storage.StorageArea;

const storageNamespaceSeparator = '::';
const userScriptStorageNamespace = 'userscripts';
const userScriptMetaStorageNamespace = 'userscripts-meta';
let userScriptStorageKeyPrefix = userScriptStorageNamespace + storageNamespaceSeparator;
let userScriptMetaStorageKeyPrefix = userScriptMetaStorageNamespace + storageNamespaceSeparator;
const userScriptStorageKey = (scriptId: string) => userScriptStorageKeyPrefix + scriptId;
const userScriptStorageMetaKey = (scriptId: string) => userScriptMetaStorageKeyPrefix + scriptId;

const extensionInstanceId = crypto.randomUUID()

export type ChromeUserScript = {
    id: string;
    code: string;
    enabled: boolean;
}

export type ChromeUserScriptMetaLocal = {
    id: string,
    hash: string,
    meta: UserScriptMeta,
    enabled: boolean,
    synced?: boolean,
}

type ChromeUserScriptMetaSync = {
    id: string,
    hash: string,
    enabled: boolean,
    fileId: string,
}

export type UserScript = {
    meta: UserScriptMeta;
    code: string;
}

export type UserScriptMeta = {
    name: string;
    namespace?: string;
    version?: string;
    icon?: string;
    description?: string;
    author?: string;
    'run-at'?: string;
    match?: string[];
}

export async function load() {
    console.log('loading user scripts...');
    for (const meta of await getAll()) {
        console.log('loading user script:', meta.id);
        const code = await getStorageItem<string>(
            chrome.storage.local, userScriptStorageKey(meta.id));
        const registeredUserScript = buildRegisteredUserScript(meta.id, code!);
        console.log('registering user script:', meta.id);
        await chrome.userScripts.register([registeredUserScript]);
    }

    // --- storage

    chrome.storage.onChanged.addListener((changes, areaName) => {
        (async () => {
            if (areaName === 'sync') {
                for (const [_, change] of Object.entries(changes)) {
                    if (isLocalSyncStorageChange(change)) {
                        continue;
                    }

                    if (change.newValue) {
                        const newUserScriptMetaSync = unwrapSyncStorageEntry<ChromeUserScriptMetaSync>(change.newValue);
                        await set({
                            id: newUserScriptMetaSync.id,
                            // TODO only download if hash differs from local storage
                            code: await downloadFromGoogleDrive(newUserScriptMetaSync.fileId),
                            enabled: newUserScriptMetaSync.enabled,
                        }, false);
                    } else {
                        const oldUserScriptMetaSync = unwrapSyncStorageEntry<ChromeUserScriptMetaSync>(change.oldValue);
                        await remove(oldUserScriptMetaSync.id, false)
                    }
                }
            }
        })();
    });

    // --- tabs

    chrome.tabs.onRemoved.addListener(async (tabId) => {
        console.log("tab", tabId, "removed");
        // TODO delete tabsUserScriptIds[tabId];
    });

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
        console.log("tab", tabId, "updated:", changeInfo);
        if (changeInfo.status === 'loading') {
            // TODO delete tabsUserScriptIds[tabId];
        }
    });

    // --- messages
    await chrome.userScripts.configureWorld({messaging: true});

    chrome.runtime.onUserScriptMessage.addListener((message, sender) => {
        const tabId = sender.tab?.id;
        if (!tabId) return;

        if (message.event === 'USER_SCRIPT_INJECTED') {
            // TODO  const tabUserScriptIds = tabsUserScriptIds[tabId] ??= [];
            // TODO tabUserScriptIds.push(message.userScriptId);
            // TODO  emit event for service worker
        }
    });
}

export async function set(userScript: Partial<ChromeUserScript>, sync = true): Promise<ChromeUserScriptMetaLocal> {
    if (!userScript.id && !userScript.code) {
        throw new Error('Either id or code must be provided to create or update a user script.');
    }

    const isNewUserScript = !userScript.id;
    const userScriptHash = userScript.code ? await calculateHash(userScript.code) : null;

    const userScriptMetaLocal: ChromeUserScriptMetaLocal = isNewUserScript
        ? {
            id: crypto.randomUUID(),
            hash: userScriptHash!,
            meta: parse(userScript.code!).meta,
            enabled: userScript.enabled ?? true,
            synced: false,
        } : (await getStorageItem(chrome.storage.local, userScriptStorageMetaKey(userScript.id!))
            ?? _throw(new Error('User script meta not found for id: ' + userScript.id)));

    const userScriptCodeChanged = isNewUserScript || (userScriptHash !== null && userScriptHash !== userScriptMetaLocal.hash);

    if (!userScript.id) {
        userScript.id = userScriptMetaLocal.id;
    }

    if (userScript.code !== undefined) {
        if (userScriptCodeChanged) {
            await setStorageItem<string>(chrome.storage.local,
                userScriptStorageKey(userScriptMetaLocal.id), userScript.code);
            userScriptMetaLocal.hash = userScriptHash!;
            userScriptMetaLocal.meta = parse(userScript.code).meta;
        }
    }

    if (userScript.enabled !== undefined) {
        userScriptMetaLocal.enabled = userScript.enabled;
    }

    // TODO refactor
    if (sync) {
        userScriptMetaLocal.synced = false
    }

    await setStorageItem<ChromeUserScriptMetaLocal>(chrome.storage.local,
        userScriptStorageMetaKey(userScriptMetaLocal.id), userScriptMetaLocal);

    const userScriptIsRegistered = await userScriptsHasScript(userScriptMetaLocal.id);
    if (userScript.enabled === true) {
        if (userScriptCodeChanged) {
            const registeredUserScript = buildRegisteredUserScript(userScriptMetaLocal.id, userScript.code!);
            if (userScriptIsRegistered) {
                console.log('updating user script:', userScriptMetaLocal.id);
                await chrome.userScripts.update([registeredUserScript]);
            } else {
                console.log('registering user script:', userScriptMetaLocal.id);
                await chrome.userScripts.register([registeredUserScript]);
            }
        }
    } else {
        if (userScriptIsRegistered) {
            await chrome.userScripts.unregister({ids: [userScriptMetaLocal.id]});
        }
    }

    if (userScriptMetaLocal.synced === false) {
        // TODO handle offline case
        let userScriptMetaSync = await getStorageItem<ChromeUserScriptMetaSync>(
            chrome.storage.sync, userScriptStorageMetaKey(userScriptMetaLocal.id));
        if (!userScriptMetaSync) {
            const fileId = await uploadToGoogleDrive({
                fileName: userScriptMetaLocal.id + '.user.js',
                fileContent: userScript.code ?? '',
            });
            userScriptMetaSync = {
                id: userScriptMetaLocal.id,
                hash: userScriptMetaLocal.hash,
                enabled: userScriptMetaLocal.enabled,
                fileId,
            }
        } else if (userScriptCodeChanged) {
            await uploadToGoogleDrive({
                fileId: userScriptMetaSync.fileId,
                fileContent: userScript.code ?? '',
            });
            userScriptMetaSync.hash = userScriptHash!;
        }


        if (userScript.enabled !== undefined) {
            userScriptMetaSync.enabled = userScript.enabled;
        }
        console.log('userScriptMetaSync', userScriptMetaSync);
        await setStorageItem<ChromeUserScriptMetaSync>(chrome.storage.sync,
            userScriptStorageMetaKey(userScriptMetaSync.id), userScriptMetaSync);

        userScriptMetaLocal.synced = true;
        await setStorageItem<ChromeUserScriptMetaLocal>(chrome.storage.local,
            userScriptStorageMetaKey(userScriptMetaLocal.id), userScriptMetaLocal);
    }


    return userScriptMetaLocal
}

export async function get(id: string): Promise<ChromeUserScriptMetaLocal & ChromeUserScript> {
    const meta = await getStorageItem<ChromeUserScriptMetaLocal>(chrome.storage.local, userScriptStorageMetaKey(id))
        ?? _throw(new Error(`User script does not exist. id: ${id}`));
    const code = await getStorageItem<string>(chrome.storage.local, userScriptStorageKey(id))
        ?? _throw(new Error(`User script code does not exist. id: ${id}`));
    return {
        ...meta,
        code,
    };
}

export async function getAll(): Promise<ChromeUserScriptMetaLocal[]> {
    return await chrome.storage.local.get().then((entries) => {
        return Object.entries(entries)
            .filter(([key]) => key.startsWith(userScriptMetaStorageKeyPrefix))
            .map(([_, value]) => value);
    });
}

export async function remove(id: string, sync = true): Promise<void> {
    if (sync) {
        const userScriptMetaSync = await getStorageItem<ChromeUserScriptMetaSync>(
                chrome.storage.sync, userScriptStorageMetaKey(id))
            ?? _throw(new Error(`User script does not exist. id: ${id}`));
        console.log('deleting from google drive:', userScriptMetaSync.id);
        await deleteFromGoogleDrive(userScriptMetaSync.fileId);
        console.log('deleting from sync storage:', id);
        await chrome.storage.sync.remove(userScriptStorageMetaKey(id));
    }
    console.log('deleting from local storage:', id);
    await chrome.storage.local.remove(userScriptStorageMetaKey(id));
    await chrome.storage.local.remove(userScriptStorageKey(id));
    console.log('unregistering user script:', id);
    await chrome.userScripts.unregister({ids: [id]});
}

function buildRegisteredUserScript(id: string, code: string): RegisteredUserScript {
    const userScript = parse(code);
    return {
        id,
        matches: userScript.meta.match,
        runAt: userScript.meta['run-at']?.replace('-', '_') as RunAt ?? 'document_idle',
        world: "USER_SCRIPT", // "MAIN" | "USER_SCRIPT",
        js: [
            {
                code: functionCallAsString(
                    (userScriptId: string) => chrome.runtime.sendMessage({
                        event: 'USER_SCRIPT_INJECTED', userScriptId,
                    }),
                    id,
                )
            },
            {
                code: userScript.code,
            },
        ],
    };
}

function functionCallAsString(fn: (...args: any[]) => any, ...args: Parameters<typeof fn>) {
    return `(${fn})(${args.map(arg => JSON.stringify(arg)).join(',')});`;
}


export function parse(userScriptRaw: string): UserScript {
    const userScriptRegexp = /\B\/\/ ==UserScript==\r?\n(?<metaContent>[\S\s]*?)\r?\n\/\/ ==\/UserScript==(\S*\r?\n)*(?<code>[\S\s]*)/
    const userScriptMatch = userScriptRaw?.match(userScriptRegexp)
    if (!userScriptMatch?.groups) {
        throw new Error('Invalid userscript format:\n' + userScriptRaw);
    }
    const {metaContent, code} = userScriptMatch.groups;

    const metaTags = {} as Record<string, string[]>;
    metaContent.split('\n').forEach(function (line) {
        const lineMatch = line.match(/@(?<key>[\w-]+)\s+(?<value>.+)/);
        if (!lineMatch?.groups) {
            throw new Error('Invalid userscript meta tag: ' + line);
        }

        const {key, value} = lineMatch.groups;
        metaTags[key] ??= [];
        metaTags[key].push(value);
    });

    if (metaTags.name?.length !== 1) {
        throw new Error('User script must have exactly one @name field.');
    }

    /**
     * https://violentmonkey.github.io/api/metadata-block/
     * https://wiki.greasespot.net/Metadata_Block
     * https://www.tampermonkey.net/documentation.php
     */

    return {
        meta: {
            name: metaTags.name[0],
            namespace: metaTags.namespace?.[0],
            version: metaTags.version?.[0],
            icon: metaTags.icon?.[0],
            description: metaTags.description?.[0],
            author: metaTags.author?.[0],
            'run-at': metaTags['run-at']?.[0],
            match: metaTags.match,
        },
        code,
    };
}


type SyncStorageEntry = {
    origin: string,
    payload: any,
}

// TODO move to frontend
export function determineIcon(userScriptMeta: UserScriptMeta): string | undefined {
    if (userScriptMeta.icon) {
        return userScriptMeta.icon;
    }

    const match = userScriptMeta.match?.[0];
    if (match) {
        try {
            const matchHost = new URL(match).host;
            return 'https://www.google.com/s2/favicons?sz=64&domain=' + matchHost;
        } catch {
            // ignore
        }
    }
}

// ----- Synced Storage ----------


function wrapSyncStorageEntry(payload: any): SyncStorageEntry {
    return {
        origin: extensionInstanceId,
        payload,
    }
}

function unwrapSyncStorageEntry<T>(entry: SyncStorageEntry): T {
    return entry.payload as T;
}

function isLocalSyncStorageChange(change: StorageChange) {
    return (change.newValue as SyncStorageEntry)?.origin === extensionInstanceId
        || (!change.newValue && (change.oldValue as SyncStorageEntry)?.origin === extensionInstanceId);
}

/**
 * --- ON STARTUP
 * load all userscripts from sync storage
 *  for each userscript
 *   check if local storage code is up to date
 *    if not
 *      get code from google drive
 *      store to local storage (id, code)
 *   register user script
 *   remove local storage entries (uploaded=true) not in sync storage
 *   upload local storage entries (uploaded=false) to google drive
 *    store to sync storage (id, enabled, google drive file id)
 *
 * register storage sync change listener
 *  if newValue
 *   get code from google drive
 *   store to local storage (id, enabled, code)
 *   register user script
 *  else
 *    remove from local storage
 *    unregister user script
 */


async function uploadToGoogleDrive({fileId, fileName, fileContent}: {
    fileId?: string,
    fileName?: string;
    fileContent: string,
}) {
    // TODO handle disconnected(removed from account) oauth app
    const accessToken = await chrome.identity.getAuthToken({
        interactive: true,
        scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    });

    if (!fileId) {
        const form = new FormData();
        form.append('metadata', new Blob(
            [JSON.stringify({
                name: fileName,
                mimeType: 'text/plain',
                parents: ['appDataFolder'],
            })],
            {type: 'application/json'},
        ));
        form.append('file', new Blob([fileContent], {type: 'text/plain'}));

        return await fetch(
            'https://www.googleapis.com/upload/drive/v3/files' + (fileId ? `/${fileId}` : '')
            + '?uploadType=multipart&fields=id',
            {
                method: !fileId ? 'POST' : 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken.token}`,
                },
                body: form,
            })
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error(`Failed to upload file ${fileId}: ${res.status} ${res.statusText}`
                        + await res.text());
                }
                return await res.json().then((res) => res.id);
            });
    } else {
        await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken.token}`,
                    'Content-Type': 'text/plain',
                    'Content-Length': fileContent.length.toString(),
                },
                body: new Blob([fileContent], {type: 'text/plain'}),
            }
        );
        return fileId;
    }


}

async function downloadFromGoogleDrive(fileId: string) {
    const accessToken = await chrome.identity.getAuthToken({
        interactive: true,
        scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    });
    return await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
            },
        })
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(`Failed to download file ${fileId}: ${res.status} ${res.statusText}\n`
                    + await res.text());
            }
            return await res.text();
        });
}

async function deleteFromGoogleDrive(fileId: string) {
    const accessToken = await chrome.identity.getAuthToken({
        interactive: true,
        scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    });
    return await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
            },
        })
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(`Failed to delete file ${fileId}: ${res.status} ${res.statusText}\n`
                    + await res.text());
            }
        });
}

async function calculateHash(content: string): Promise<string> {
    if (content === undefined) {
        throw new Error('Content is undefined');
    }
    return await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(content))
        .then((buffer => new Uint8Array(buffer).toBase64({urlSafe: false, omitPadding: false})))
}

async function getStorageItem<T>(storage: StorageArea, key: string): Promise<T | undefined> {
    return storage.get(key)
        .then((data) => data?.[key])
        .then((value) => {
            if (storage === chrome.storage.sync && value) {
                return unwrapSyncStorageEntry<T>(value);
            }
            return value as T | undefined;
        })
}

async function setStorageItem<T>(storage: StorageArea, key: string, value: T): Promise<void> {
    if (storage === chrome.storage.sync) {
        value = wrapSyncStorageEntry(value) as unknown as T;
    }

    return storage.set({[key]: value});
}

async function userScriptsGetScript(id: string) {
    return chrome.userScripts.getScripts({ids: [id]}).then((scrips) => scrips[0]);
}

async function userScriptsHasScript(id: string) {
    return userScriptsGetScript(id).then((script) => !!script);
}

function _throw(error: any): never {
    throw error;
}