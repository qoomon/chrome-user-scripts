import extension from "@/extension.ts";
import {_throw, noop} from "@/common.ts";
import {driveStorage, DriveStorage} from "@/service_worker/drive_storage.ts";
import RegisteredUserScript = chrome.userScripts.RegisteredUserScript;
import StorageArea = chrome.storage.StorageArea;
import RunAt = chrome.extensionTypes.RunAt;

// Storage key constants
const STORAGE_NAMESPACE_SEPARATOR = ':';
const USER_SCRIPT_STORAGE_NAMESPACE = 'userscripts';
const USER_SCRIPT_META_STORAGE_NAMESPACE = 'userscripts-meta';
const USER_SCRIPT_STORAGE_KEY_PREFIX = USER_SCRIPT_STORAGE_NAMESPACE + STORAGE_NAMESPACE_SEPARATOR;
const USER_SCRIPT_META_STORAGE_KEY_PREFIX = USER_SCRIPT_META_STORAGE_NAMESPACE + STORAGE_NAMESPACE_SEPARATOR;
const SESSION_STORAGE_TAB_KEY_PREFIX = 'tab:';

const userScriptStorageKey = (scriptId: string) => USER_SCRIPT_STORAGE_KEY_PREFIX + scriptId;
const userScriptStorageMetaKey = (scriptId: string) => USER_SCRIPT_META_STORAGE_KEY_PREFIX + scriptId;
const sessionStorageTabKey = (tabId: number) => `${SESSION_STORAGE_TAB_KEY_PREFIX}${tabId}:userScripts`;

export type ChromeUserScript = {
    id: string;
    code: string;
    enabled: boolean;
}

export type ChromeUserScriptMeta = {
    id: string,
    hash: string,
    meta: UserScriptMeta,
    enabled: boolean,
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
    runAt?: string;
    matches?: string[];
    excludeMatches?: string[];
    requires?: string[];
    noFrames?: boolean;
    world?: string;
}

const tabsMatchingUserScripts = new Map<number, string[]>();

const listeners = {
    onInjection: [] as Array<(tabId: number) => void>,
}
export const onInjection = {
    addListener(listener: (tabId: number) => void) {
        listeners.onInjection.push(listener);
    }
}

export async function init() {
    await chrome.userScripts.configureWorld({messaging: true});

    chrome.runtime.onInstalled.addListener(async () => {
        await registerAllUserScripts();
    });

    chrome.runtime.onStartup.addListener(async () => {
        await registerAllUserScripts();
    });

    async function registerAllUserScripts() {
        await chrome.userScripts.unregister();
        for (const meta of await getAll()) {
            if (meta.enabled) {
                const code = await getStorageItem<string>(
                    driveStorage, userScriptStorageKey(meta.id));
                if (code) {
                    const registeredUserScript = buildRegisteredUserScript(meta.id, code);
                    await chrome.userScripts.register([registeredUserScript]);
                }
            }
        }
    }

    // --- tab userscript tracking

    chrome.runtime.onUserScriptMessage.addListener(async (message, sender) => {
        const tabId = sender.tab?.id;
        if (!tabId) return;

        if (message.event === 'USER_SCRIPT_INJECTED') {
            await addMatchingUserScripts(tabId, message.id);
            listeners.onInjection.forEach((listener) => listener(tabId));
        }
    });

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
        if (changeInfo.status === 'loading') {
            await clearMatchingUserScripts(tabId);
        }
    });

    chrome.tabs.onRemoved.addListener(async (tabId) => {
        await clearMatchingUserScripts(tabId);
    })

    // --- sync storage change listener
    driveStorage.onChanged.addListener((changes) => {
        (async () => {
            for (const [key, change] of Object.entries(changes)) {
                if (change.newValue !== null
                    && typeof change.newValue === 'object'
                    && 'origin' in change.newValue
                    && change.newValue.origin === extension.installationId) {
                    // ignore local changes
                    continue;
                }

                if (key.startsWith(USER_SCRIPT_META_STORAGE_KEY_PREFIX)) {
                    if (change.newValue) {
                        const newValue = change.newValue as StorageItem<ChromeUserScriptMeta>;
                        await set(newValue.value, 'STORAGE_CHANGE');
                    } else {
                        const oldUserScriptMeta = change.oldValue as ChromeUserScriptMeta;
                        await remove(oldUserScriptMeta.id, 'STORAGE_CHANGE')
                    }
                } else if (key.startsWith(USER_SCRIPT_STORAGE_KEY_PREFIX)) {
                    if (change.newValue) {
                        const id = key.substring(USER_SCRIPT_STORAGE_KEY_PREFIX.length);
                        const newValue = change.newValue as StorageItem<string>;
                        await set({
                            id,
                            code: newValue.value,
                        }, 'STORAGE_CHANGE');
                    }
                }
            }
        })();
    });
}

export async function set(userScript: Partial<ChromeUserScript>, ref?: 'STORAGE_CHANGE'): Promise<ChromeUserScriptMeta> {
    if (!userScript.id && !userScript.code) {
        throw new Error('Either id or code must be provided to create or update a user script.');
    }

    const isNewUserScript = !userScript.id;
    const userScriptHash = userScript.code ? await calculateHash(userScript.code) : null;

    const chromeUserScriptMeta: ChromeUserScriptMeta = isNewUserScript
        ? {
            id: crypto.randomUUID(),
            hash: userScriptHash!,
            meta: parse(userScript.code!).meta,
            enabled: userScript.enabled ?? true,
        } : (await getStorageItem<ChromeUserScriptMeta>(driveStorage, userScriptStorageMetaKey(userScript.id!))
            ?? _throw(new Error('User script meta not found for id: ' + userScript.id)));

    const userScriptCodeChanged = isNewUserScript || (userScriptHash !== null && userScriptHash !== chromeUserScriptMeta.hash);

    if (!userScript.id) {
        userScript.id = chromeUserScriptMeta.id;
    }

    if (userScript.code !== undefined && userScriptCodeChanged) {
        chromeUserScriptMeta.hash = userScriptHash!;
        chromeUserScriptMeta.meta = parse(userScript.code).meta;
    }

    if (userScript.enabled !== undefined) {
        chromeUserScriptMeta.enabled = userScript.enabled;
    }

    if (ref !== 'STORAGE_CHANGE') {
        await setStorageItem<ChromeUserScriptMeta>(driveStorage,
            userScriptStorageMetaKey(chromeUserScriptMeta.id),
            chromeUserScriptMeta);
        if (userScript.code !== undefined && userScriptCodeChanged) {
            await setStorageItem<string>(driveStorage,
                userScriptStorageKey(chromeUserScriptMeta.id),
                userScript.code);
        }
    }

    const userScriptIsRegistered = await userScriptsHasScript(chromeUserScriptMeta.id);
    if (userScript.enabled === true) {
        if (!userScriptIsRegistered || userScriptCodeChanged) {
            const code = userScript.code
                ?? await getStorageItem<string>(driveStorage, userScriptStorageKey(chromeUserScriptMeta.id))
                ?? '';

            const registeredUserScript = buildRegisteredUserScript(chromeUserScriptMeta.id, code);
            if (userScriptIsRegistered) {
                await chrome.userScripts.update([registeredUserScript]);
            } else {
                await chrome.userScripts.register([registeredUserScript]);
            }
        }
    } else {
        if (userScriptIsRegistered) {
            await chrome.userScripts.unregister({ids: [chromeUserScriptMeta.id]});
        }
    }

    return chromeUserScriptMeta
}

export async function get(id: string): Promise<ChromeUserScriptMeta & ChromeUserScript> {
    const meta = await getStorageItem<ChromeUserScriptMeta>(driveStorage, userScriptStorageMetaKey(id))
        ?? _throw(new Error(`User script does not exist. id: ${id}`));
    const code = await getStorageItem<string>(driveStorage, userScriptStorageKey(id))
        ?? _throw(new Error(`User script code does not exist. id: ${id}`));
    return {
        ...meta,
        code,
    };
}

export async function getAll(): Promise<ChromeUserScriptMeta[]> {
    return await driveStorage.get<StorageItem<ChromeUserScriptMeta>>().then((entries) => {
        return Object.entries(entries)
            .filter(([key]) => key.startsWith(USER_SCRIPT_META_STORAGE_KEY_PREFIX))
            .map(([_, value]) => value.value)
            .sort((a, b) => a.meta.name.localeCompare(b.meta.name));
    });
}

async function addMatchingUserScripts(tabId: number, userScriptId: string) {
    const matchingUserScripts = tabsMatchingUserScripts.get(tabId) || [];
    tabsMatchingUserScripts.set(tabId, matchingUserScripts);
    matchingUserScripts.push(userScriptId);
    await setStorageItem(chrome.storage.session,
        sessionStorageTabKey(tabId), matchingUserScripts);
}

async function clearMatchingUserScripts(tabId: number) {
    tabsMatchingUserScripts.delete(tabId);
    await chrome.storage.session.remove(sessionStorageTabKey(tabId)).catch(noop);
}

export async function getMatchingUserScriptIds(tabId: number): Promise<string[]> {
    return await getStorageItem<string[]>(chrome.storage.session,
        sessionStorageTabKey(tabId)) ?? [];
}


export async function remove(id: string, ref?: 'STORAGE_CHANGE'): Promise<void> {
    if (ref !== 'STORAGE_CHANGE') {
        await driveStorage.remove(userScriptStorageMetaKey(id));
        await driveStorage.remove(userScriptStorageKey(id));
    }
    const userScriptIsRegistered = await userScriptsHasScript(id);
    if (userScriptIsRegistered) {
        await chrome.userScripts.unregister({ids: [id]});
    }
}

function buildRegisteredUserScript(id: string, code: string): RegisteredUserScript {
    const userScript = parse(code);

    const runAt = userScript.meta.runAt
        ?.replace('-', '_')?.toLowerCase() as RunAt | undefined;
    if (runAt && !['document_start', 'document_end', 'document_idle', 'context_idle'].includes(runAt)) {
        throw new Error('Unexpected value for @run-at valid values are document_start, document_end, document_idle, context_idle, but got: ' + runAt);
    }

    const world = userScript.meta.world
        ?.replace('-', '_')?.toUpperCase() as 'USER_SCRIPT' | 'MAIN' | undefined;
    if (world && world !== 'USER_SCRIPT' && world !== 'MAIN') {
        throw new Error('Unexpected value for @run-at valid values are user_script or main, but got: ' + world);
    }

    const codeToInject = [];
    // Notify service worker that the user script has been injected
    codeToInject.push(functionCallAsString((id: string) => {
        const count = window.sessionStorage.getItem('__USER_SCRIPT_INJECTION_COUNT') || "0";
        window.sessionStorage.setItem('__USER_SCRIPT_INJECTION_COUNT', (parseInt(count) + 1).toString());
        // noinspection JSIgnoredPromiseFromCall
        chrome.runtime.sendMessage({
            event: 'USER_SCRIPT_INJECTED', id,
        })
    }, id));

    if (userScript.meta.requires) {
        userScript.meta.requires.map((src => functionCallAsString(async (src: string) => {
            const code = await fetch(src).then((res) => res.text());
            new Function(code)();
        }, src))).forEach(codeToInject.push);
    }

    codeToInject.push(userScript.code);

    return {
        id,
        matches: userScript.meta.matches,
        excludeMatches: userScript.meta.excludeMatches,
        allFrames: !userScript.meta.noFrames,
        runAt,
        world,
        js: codeToInject.map((code) => ({code})),
    };
}

function functionCallAsString<T extends unknown[]>(fn: (...args: T) => unknown, ...args: T): string {
    return `(${fn})(${args.map(arg => JSON.stringify(arg)).join(',')});`;
}

export function parse(userScriptRaw: string): UserScript {
    const userScriptRegexp = /\B\/\/\s*==UserScript==\r?\n(?<metaContent>[\S\s]*?)\r?\n\/\/\s*==\/UserScript==(\S*\r?\n)*(?<code>[\S\s]*)/
    const userScriptMatch = userScriptRaw?.match(userScriptRegexp)
    if (!userScriptMatch?.groups) {
        throw new Error('Invalid userscript format:\n' + userScriptRaw);
    }
    const {metaContent, code} = userScriptMatch.groups;

    const metaTags = {} as Record<string, string[]>;
    metaContent.split('\n')
        .filter((line) => line.trim().startsWith('//'))
        .forEach((line) => {
            const lineMatch = line.trim().match(/@(?<key>[\w-]+)\s+(?<value>.+)/);
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
            runAt: metaTags['run-at']?.[0],
            matches: metaTags.match,
            excludeMatches: metaTags['exclude-match'],
            requires: metaTags.require,
            noFrames: metaTags['no-frames'] ? metaTags['no-frames']?.length >= 0 : undefined,
            world: metaTags.world?.[0],
        },
        code,
    };
}

export function determineIcon(userScriptMeta: UserScriptMeta): string | undefined {
    if (userScriptMeta.icon) {
        return userScriptMeta.icon;
    }

    const match = userScriptMeta.matches?.[0];
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

async function getStorageItem<T>(storageArea: StorageArea | DriveStorage, key: string): Promise<T | undefined> {
    return storageArea.get<Record<string, StorageItem<T>>>(key).then((items) => {
        return items[key]?.value as T;
    });
}

async function setStorageItem<T>(storageArea: StorageArea | DriveStorage, key: string, value: T): Promise<void> {
    const wrappedValue = wrapStorageItem(value);
    if ('onChanged' in storageArea && typeof storageArea.onChanged === 'object') {
        // DriveStorage
        await (storageArea as DriveStorage).set({[key]: wrappedValue});
    } else {
        // chrome.storage.StorageArea
        await (storageArea as StorageArea).set({[key]: wrappedValue});
    }
}

type StorageItem<T> = {
    origin: string;
    value: T;
}

function wrapStorageItem<T>(value: T): StorageItem<T> {
    return {
        origin: extension.installationId,
        value,
    };
}

async function calculateHash(content: string): Promise<string> {
    if (content === undefined) {
        throw new Error('Content is undefined');
    }
    return await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(content))
        .then((buffer => new Uint8Array(buffer).toBase64({urlSafe: false, omitPadding: false})))
}

async function userScriptsGetScript(id: string) {
    return chrome.userScripts.getScripts({ids: [id]}).then((scrips) => scrips[0]);
}

async function userScriptsHasScript(id: string) {
    return userScriptsGetScript(id).then((script) => !!script);
}

