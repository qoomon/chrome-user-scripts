import RegisteredUserScript = chrome.userScripts.RegisteredUserScript;
import RunAt = chrome.extensionTypes.RunAt;
import LZString from "lz-string";
import StorageChange = chrome.storage.StorageChange;
import {Optional} from "@/common.ts";

const storageNamespaceSeparator = '::';
const userScriptStorageNamespace = 'userscripts';
const userScriptStorageKeyPrefix = userScriptStorageNamespace + storageNamespaceSeparator;
const extensionInstanceId = crypto.randomUUID()

export async function load() {
    // clear all registered user script
    await chrome.userScripts.unregister();
    for (const userscript of await storageSyncGetUserScripts()) {
        await set(userscript, false);
    }

    // --- storage

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync') {
            for (const [_, change] of Object.entries(changes)) {
                if (isOriginatedByExtensionInstance(change)) {
                    continue;
                }

                if (change.newValue) {
                    const newUserScript = decodeStorageEntry<UserScript>(change.newValue);
                    set(newUserScript, false);
                } else {
                    const oldUserScript = decodeStorageEntry<UserScript>(change.oldValue);
                    remove(oldUserScript.id, false)
                }
            }
        }

        function isOriginatedByExtensionInstance(change: StorageChange) {
            return change.newValue?.origin === extensionInstanceId
                || (!change.newValue && change.oldValue?.origin === extensionInstanceId);
        }
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

export async function set(userScript_: Optional<UserScript, 'id'>, store = true): Promise<UserScript> {
    const userScript = {
        ...userScript_,
        id: userScript_.id ?? crypto.randomUUID(),
    };

    if (store) {
        await storageSyncSetUserScript(userScript);
    }

    const userScriptExists = await chrome.userScripts.getScripts({ids: [userScript.id]})
        .then(scripts => !!scripts[0]);

    if (userScript.enabled) {
        const registeredUserScript = buildRegisteredUserScript(userScript);
        if (userScriptExists) {
            await chrome.userScripts.update([registeredUserScript]);
        } else {
            await chrome.userScripts.register([registeredUserScript]);
        }
    } else {
        if (userScriptExists) {
            await chrome.userScripts.unregister({ids: [userScript.id]});
        }
    }


    return userScript
}

export async function remove(id: string, store = true): Promise<void> {
    if (store) {
        await chrome.storage.sync.remove(id);
    }
    await chrome.userScripts.unregister({ids: [id]});
}

function buildRegisteredUserScript(userScript: UserScript): RegisteredUserScript {
    const userScriptMeta = parse(userScript.code);
    return {
        id: userScript.id,
        matches: userScriptMeta.match,
        runAt: userScriptMeta['run-at']?.replace('-', '_') as RunAt ?? 'document_idle',
        world: "USER_SCRIPT", // "MAIN" | "USER_SCRIPT",
        js: [
            {
                code: functionCallAsString(
                    (userScriptId: string) => chrome.runtime.sendMessage({
                        event: 'USER_SCRIPT_INJECTED', userScriptId,
                    }), userScript.id,
                )
            },
            {
                code: userScriptMeta.code,
            },
        ],
    };
}

function functionCallAsString(fn: (...args: any[]) => any, ...args: Parameters<typeof fn>) {
    return `(${fn})(${args.map(arg => JSON.stringify(arg)).join(',')});`;
}

export async function getAll() {
    return await storageSyncGetUserScripts()
}

export async function get(id: string) {
    return await storageSyncGetUserScript(id);
}

export function parse(userScriptRaw: string): UserScriptMeta {
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
        name: metaTags.name[0],
        namespace: metaTags.namespace?.[0],
        version: metaTags.version?.[0],
        icon: metaTags.icon?.[0],
        description: metaTags.description?.[0],
        author: metaTags.author?.[0],
        'run-at': metaTags['run-at']?.[0],
        match: metaTags.match,
        code,
    };
}

export type UserScript = {
    id: string;
    enabled: boolean;
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
    code: string;
}

type StorageEntry = {
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

async function storageSyncSetUserScript(userScript: UserScript) {
    const entry = encodeStorageEntry(userScript);
    const entryKey = userScriptStorageKeyPrefix + userScript.id;
    return await chrome.storage.sync.set({[entryKey]: entry});
}

async function storageSyncGetUserScripts() {
    return await chrome.storage.sync.get().then((entries) => {
        return Object.entries(entries)
            .filter(([key]) => key.startsWith(userScriptStorageKeyPrefix))
            .map(([_, value]) => decodeStorageEntry<UserScript>(value));
    });
}

async function storageSyncGetUserScript(id: string) {
    const key = userScriptStorageKeyPrefix + id;
    return await chrome.storage.sync.get(key)
        .then((data) => data?.[key])
        .then((value) => value ? decodeStorageEntry<UserScript>(value) : null);
}


function encodeStorageEntry(payload: any): StorageEntry {
    return {
        origin: extensionInstanceId,
        payload: LZString.compressToBase64(JSON.stringify(payload)),
    }
}

function decodeStorageEntry<T>(entry: StorageEntry): T {
    return JSON.parse(LZString.decompressFromBase64(entry.payload)) as T;
}


//
// // --- User scripts management ---
//
// export type Config = {
//     enabled: boolean;
// }
//
// let _config: Config;
//
// export async function getConfig(): Promise<Config> {
//     if (!_config) {
//         _config = {
//             enabled: true,
//             ...(await chrome.storage.local.get('config')
//                 .then((data) => data['config'])),
//         }
//     }
//     return _config;
// }
//
// export async function setConfig(partialConfig: Partial<Config>) {
//     Object.assign(_config, partialConfig);
//     await chrome.storage.local.set({
//         ['config']: addStorageMeta(_config),
//     });
//
//     if (partialConfig.enabled !== _config.enabled) {
//         if (partialConfig.enabled === false) {
//             // Unregister all user scripts
//             const registeredScripts = await chrome.userScripts.getScripts();
//             if (registeredScripts.length > 0) {
//                 console.debug(`Unregistering ALL user scripts as the feature is disabled.`);
//                 await chrome.userScripts.unregister({ids: registeredScripts.map(s => s.id)});
//             }
//         }
//         if (partialConfig.enabled === true) {
//             // Register all enabled user scripts
//             for (const userScript of Object.values(userScripts)) {
//                 await setUserScript(userScript);
//             }
//         }
//     }
// }
//
//


