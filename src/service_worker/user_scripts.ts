import RegisteredUserScript = chrome.userScripts.RegisteredUserScript;
import RunAt = chrome.extensionTypes.RunAt;
import LZString from "lz-string";
import StorageChange = chrome.storage.StorageChange;
import {Optional} from "@/common.ts";

// Storage configuration
const STORAGE_NAMESPACE_SEPARATOR = '::';
const USERSCRIPT_STORAGE_NAMESPACE = 'userscripts';
const USERSCRIPT_STORAGE_KEY_PREFIX = USERSCRIPT_STORAGE_NAMESPACE + STORAGE_NAMESPACE_SEPARATOR;
const extensionInstanceId = crypto.randomUUID()

// UserScript metadata constants
const DEFAULT_RUN_AT: RunAt = 'document_idle';
const DEFAULT_WORLD = 'USER_SCRIPT' as const;

// Events
const USER_SCRIPT_INJECTED_EVENT = 'USER_SCRIPT_INJECTED';

export async function load() {
    try {
        // clear all registered user script
        await chrome.userScripts.unregister();
        const userscripts = await storageSyncGetUserScripts();
        for (const userscript of userscripts) {
            await set(userscript, false);
        }
    } catch (error) {
        console.error('Failed to load user scripts:', error);
    }

    // --- storage

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync') {
            for (const [_, change] of Object.entries(changes)) {
                if (isOriginatedByExtensionInstance(change)) {
                    continue;
                }

                try {
                    if (change.newValue) {
                        const newUserScript = decodeStorageEntry<UserScript>(change.newValue);
                        set(newUserScript, false);
                    } else if (change.oldValue) {
                        const oldUserScript = decodeStorageEntry<UserScript>(change.oldValue);
                        remove(oldUserScript.id, false)
                    }
                } catch (error) {
                    console.error('Failed to process storage change:', error);
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

    try {
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
    } catch (error) {
        console.error('Failed to register/update user script:', error);
        throw error;
    }

    return userScript
}

export async function remove(id: string, store = true): Promise<void> {
    try {
        if (store) {
            const key = USERSCRIPT_STORAGE_KEY_PREFIX + id;
            await chrome.storage.sync.remove(key);
        }
        await chrome.userScripts.unregister({ids: [id]});
    } catch (error) {
        console.error('Failed to remove user script:', error);
        throw error;
    }
}

function buildRegisteredUserScript(userScript: UserScript): RegisteredUserScript {
    const userScriptMeta = parse(userScript.code);
    return {
        id: userScript.id,
        matches: userScriptMeta.match,
        runAt: userScriptMeta['run-at']?.replace('-', '_') as RunAt ?? DEFAULT_RUN_AT,
        world: DEFAULT_WORLD,
        js: [
            {
                code: functionCallAsString(
                    (userScriptId: string) => chrome.runtime.sendMessage({
                        event: USER_SCRIPT_INJECTED_EVENT, userScriptId,
                    }), userScript.id,
                )
            },
            {
                code: userScriptMeta.code,
            },
        ],
    };
}

function functionCallAsString<T extends unknown[]>(
    fn: (...args: T) => unknown, 
    ...args: T
): string {
    return `(${fn})(${args.map(arg => JSON.stringify(arg)).join(',')});`;
}

export async function getAll(): Promise<UserScript[]> {
    return await storageSyncGetUserScripts()
}

export async function get(id: string): Promise<UserScript | null> {
    return await storageSyncGetUserScript(id);
}

export function parse(userScriptRaw: string): UserScriptMeta {
    if (!userScriptRaw || typeof userScriptRaw !== 'string') {
        throw new Error('Invalid userscript: input must be a non-empty string');
    }

    const userScriptRegexp = /\B\/\/ ==UserScript==\r?\n(?<metaContent>[\S\s]*?)\r?\n\/\/ ==\/UserScript==(\S*\r?\n)*(?<code>[\S\s]*)/
    const userScriptMatch = userScriptRaw.match(userScriptRegexp)
    if (!userScriptMatch?.groups) {
        throw new Error('Invalid userscript format: missing ==UserScript== block');
    }
    const {metaContent, code} = userScriptMatch.groups;

    const metaTags = {} as Record<string, string[]>;
    const lines = metaContent.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
        const lineMatch = line.match(/@(?<key>[\w-]+)\s+(?<value>.+)/);
        if (!lineMatch?.groups) {
            // Skip lines that don't match the expected format (e.g., comments)
            continue;
        }

        const {key, value} = lineMatch.groups;
        metaTags[key] ??= [];
        metaTags[key].push(value.trim());
    }

    if (!metaTags.name || metaTags.name.length !== 1) {
        throw new Error('User script must have exactly one @name field.');
    }

    if (!metaTags.match || metaTags.match.length === 0) {
        throw new Error('User script must have at least one @match field.');
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
    payload: string,
}

// TODO move to frontend
export function determineIcon(userScriptMeta: UserScriptMeta): string | undefined {
    if (userScriptMeta.icon) {
        // Validate that the icon URL is safe (http/https only)
        try {
            const iconUrl = new URL(userScriptMeta.icon);
            if (iconUrl.protocol === 'http:' || iconUrl.protocol === 'https:') {
                return userScriptMeta.icon;
            }
        } catch {
            // Invalid URL, ignore
        }
    }

    const match = userScriptMeta.match?.[0];
    if (match) {
        try {
            const matchUrl = new URL(match);
            const matchHost = matchUrl.host;
            // Encode the domain to prevent potential XSS
            return 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(matchHost);
        } catch {
            // ignore invalid URL
        }
    }
}

// ----- Synced Storage ----------

async function storageSyncSetUserScript(userScript: UserScript) {
    try {
        const entry = encodeStorageEntry(userScript);
        const entryKey = USERSCRIPT_STORAGE_KEY_PREFIX + userScript.id;
        await chrome.storage.sync.set({[entryKey]: entry});
    } catch (error) {
        console.error('Failed to save user script to storage:', error);
        throw error;
    }
}

async function storageSyncGetUserScripts() {
    try {
        const entries = await chrome.storage.sync.get();
        return Object.entries(entries)
            .filter(([key]) => key.startsWith(USERSCRIPT_STORAGE_KEY_PREFIX))
            .map(([_, value]) => {
                try {
                    return decodeStorageEntry<UserScript>(value);
                } catch (error) {
                    console.error('Failed to decode storage entry:', error);
                    return null;
                }
            })
            .filter((script): script is UserScript => script !== null);
    } catch (error) {
        console.error('Failed to get user scripts from storage:', error);
        return [];
    }
}

async function storageSyncGetUserScript(id: string) {
    try {
        const key = USERSCRIPT_STORAGE_KEY_PREFIX + id;
        const data = await chrome.storage.sync.get(key);
        const value = data?.[key];
        return value ? decodeStorageEntry<UserScript>(value) : null;
    } catch (error) {
        console.error('Failed to get user script from storage:', error);
        return null;
    }
}


function encodeStorageEntry<T>(payload: T): StorageEntry {
    if (!payload) {
        throw new Error('Cannot encode null or undefined payload');
    }
    try {
        const jsonString = JSON.stringify(payload);
        const compressed = LZString.compressToBase64(jsonString);
        return {
            origin: extensionInstanceId,
            payload: compressed,
        }
    } catch (error) {
        console.error('Failed to encode storage entry:', error);
        throw error;
    }
}

function decodeStorageEntry<T>(entry: StorageEntry): T {
    if (!entry || !entry.payload) {
        throw new Error('Invalid storage entry: missing payload');
    }
    try {
        const decompressed = LZString.decompressFromBase64(entry.payload);
        if (!decompressed) {
            throw new Error('Failed to decompress storage entry');
        }
        return JSON.parse(decompressed) as T;
    } catch (error) {
        console.error('Failed to decode storage entry:', error);
        throw error;
    }
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


