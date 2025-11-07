import {
    createStorageEntry,
    getStorageEntryKey,
    getStorageEntryNamespace,
    isLocalStorageEntry, StorageEntry
} from "@/service_worker/storge.ts";
import RegisteredUserScript = chrome.userScripts.RegisteredUserScript;
import RunAt = chrome.extensionTypes.RunAt;

const userScriptNamespaceSeparator = ' > ';
const userScriptStorageNamespace = 'userscripts';

chrome.userScripts.configureWorld({
    messaging: true,
});

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

    if (metaTags.icon?.length > 1) {
        throw new Error('Ambiguous user script icon: multiple @icon fields found.');
    }
    if (metaTags.name?.length !== 1) {
        throw new Error('User script must have exactly one @name field.');
    }
    if (metaTags.namespace?.length !== 1) {
        throw new Error('User script must have exactly one @namespace field.');
    }
    if (metaTags.version?.length > 1) {
        throw new Error('Ambiguous user script icon: multiple @version fields found.');
    }
    if (metaTags.description?.length > 1) {
        throw new Error('Ambiguous user script icon: multiple @description fields found.');
    }
    if (metaTags.author?.length > 1) {
        throw new Error('Ambiguous user script icon: multiple @author fields found.');
    }
    if (metaTags['run-at']?.length > 1) {
        throw new Error('Ambiguous user script icon: multiple @run-at fields found.');
    }

    return {
        raw: userScriptRaw,
        meta: {
            icon: metaTags.icon?.[0],
            name: metaTags.name[0],
            namespace: metaTags.namespace?.[0],
            version: metaTags.version?.[0],
            description: metaTags.description?.[0],
            author: metaTags.author?.[0],
            'run-at': metaTags['run-at']?.[0],
            match: metaTags.match,
        },
        code,
    };
}

export function getId({namespace, name}: { namespace?: string, name: string }): string {
    if (namespace) {
        return namespace + userScriptNamespaceSeparator + name;
    }

    return name;
}

// --- Storage ---

const userScriptsLoaded = chrome.storage.sync.get().then(async (data) => {
    for (const [key, value] of Object.entries(data) as [string, StorageEntry][]) {
        if (getStorageEntryNamespace(key) === userScriptStorageNamespace) {
            await setUserScript(value.data);
        }
    }
});
const userScripts = {} as Record<string, BrowserUserScript>;
const tabsUserScriptIds = {} as Record<string, string[]>;

chrome.storage.onChanged.addListener(async (changes, namespace) => {
    console.debug("storage.onChanged:", {namespace, changes});
    for (const [key, {oldValue, newValue}] of Object.entries(changes) as
        [string, { oldValue: StorageEntry, newValue: StorageEntry }][]) {
        if (isLocalStorageEntry(newValue) || isLocalStorageEntry(oldValue)) {
            // skip local storage changes
            continue;
        }

        if (namespace === 'sync') {
            if (getStorageEntryNamespace(key) === userScriptStorageNamespace) {
                if (newValue) {
                    await setUserScript(newValue.data);
                } else {
                    await removeUserScript(oldValue.data.id);
                }
            }
        }
    }
});

// --- User scripts management ---

export type Config = {
    enabled: boolean;
}

let _config: Config;

export async function getConfig(): Promise<Config> {
    if (!_config) {
        _config = {
            enabled: true,
            ...(await chrome.storage.local.get('config')
                .then((data) => data['config']?.data)),
        }
    }
    return _config;
}

export async function setConfig(partialConfig: Partial<Config>) {
    Object.assign(_config, partialConfig);
    await chrome.storage.local.set({
        ['config']: createStorageEntry(_config),
    });

    if (partialConfig.enabled !== _config.enabled) {
        if (partialConfig.enabled === false) {
            // Unregister all user scripts
            const registeredScripts = await chrome.userScripts.getScripts();
            if (registeredScripts.length > 0) {
                console.debug(`Unregistering ALL user scripts as the feature is disabled.`);
                await chrome.userScripts.unregister({ids: registeredScripts.map(s => s.id)});
            }
        }
        if (partialConfig.enabled === true) {
            // Register all enabled user scripts
            for (const userScript of Object.values(userScripts)) {
                await setUserScript(userScript);
            }
        }
    }
}


export async function setUserScript(userScript: BrowserUserScript, storage = false) {
    if (!userScript.meta.name) {
        throw new Error('User script must have a name.');
    }

    if ((await getConfig()).enabled) {
        if (userScript.enabled) {
            /**@type {chrome.userScripts.RegisteredUserScript} */
            const registeredUserScript: RegisteredUserScript = {
                id: userScript.id,
                matches: userScript.meta['match'],
                runAt: userScript.meta['run-at']?.replace('-', '_') as RunAt ?? 'document_idle',
                world: "USER_SCRIPT", // "MAIN" | "USER_SCRIPT",
                js: [
                    {
                        code: functionCallAsString(
                            (userScriptId: string) => chrome.runtime.sendMessage({
                                event: 'USER_SCRIPT_INJECTED', userScriptId,
                            }),
                            userScript.id,
                        )
                    },
                    {code: userScript.code},
                ],
            };

            if (await chrome.userScripts.getScripts({ids: [userScript.id]})
                .then(scripts => scripts[0])) {
                console.debug(`Updating user script with ID "${userScript.id}".`);
                await chrome.userScripts.update([registeredUserScript]);
            } else {
                console.debug(`Registering user script with ID "${userScript.id}".`);
                await chrome.userScripts.register([registeredUserScript]);
            }
        } else {
            if (userScripts[userScript.id]) {
                console.debug(`Unregistering user script with ID "${userScript.id}".`);
                await chrome.userScripts.unregister({ids: [userScript.id]});
            }
        }
    }

    userScripts[userScript.id] = userScript;

    if (storage) {
        console.debug(`Saving user script with ID "${userScript.id}" to storage.`);
        await chrome.storage.sync.set({
            [getStorageEntryKey('userscripts', userScript.id)]: createStorageEntry(userScript),
        });
    }

    return userScript;
}

export async function getUserScript(id: string) {
    await userScriptsLoaded;
    const userScript = userScripts[id];
    if (!userScript) {
        throw new Error(`User script with ID "${id}" is unknown.`);
    }
    // Deep copy
    return JSON.parse(JSON.stringify(userScript)) as BrowserUserScript;

    // TODO
    // await chrome.storage.sync.get(getStorageEntryKey(userScriptStorageNamespace, id))
    //     .then((data) => data.data);
}

export async function getUserScripts(tabId?: string) {
    await userScriptsLoaded;
    if (tabId !== undefined) {
        const tabUserScriptIds = tabsUserScriptIds[tabId] ?? [];
        return Promise.all(tabUserScriptIds.map(getUserScript));
    }
    return Promise.all(Object.keys(userScripts).map(getUserScript));
}

export async function removeUserScript(id: string, storage = false) {
    if (await chrome.userScripts.getScripts({ids: [id]})
        .then(scripts => scripts[0])) {
        await chrome.userScripts.unregister({ids: [id]});
        delete userScripts[id];

        if (storage) {
            console.debug(`Removing user script with ID "${id}" from storage.`);
            await chrome.storage.sync.remove(
                getStorageEntryKey(userScriptStorageNamespace, id),
            );
        }
    }
}

// --- Utils ---

function functionCallAsString(fn: (...args: any[]) => any, ...args: any[]) {
    return `(${fn})(${args.map(arg => JSON.stringify(arg)).join(',')});`;
}

// --- Types ---

/**
 * https://violentmonkey.github.io/api/metadata-block/
 * https://wiki.greasespot.net/Metadata_Block
 * https://www.tampermonkey.net/documentation.php
 */
export type UserScript = {
    raw: string;
    meta: {
        icon?: string;
        name: string;
        namespace?: string;
        version?: string;
        description?: string;
        author?: string;
        'run-at'?: string;
        match?: string[];
    };
    code: string;
}

export type BrowserUserScript = UserScript & {
    id: string;
    enabled: boolean;
}

export function determineIcon(userScript: UserScript): string | undefined {
    if(userScript.meta.icon) {
        return userScript.meta.icon;
    }
    try {
        const match = userScript.meta.match?.[0];
        if(match) {
            const matchHost = new URL(match).host;
            return 'https://www.google.com/s2/favicons?sz=64&domain=' + matchHost;
        }

    } catch {

    }

    return undefined;
}

