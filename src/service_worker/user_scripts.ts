import RegisteredUserScript = chrome.userScripts.RegisteredUserScript;
import RunAt = chrome.extensionTypes.RunAt;
import {noop} from "@/common.ts";
import {
    calculateHash,
    getStorageItem,
    isLocalSyncStorageChange,
    setStorageItem,
    unwrapSyncStorageEntry,
    userScriptStorageKey,
    userScriptStorageMetaKey,
    userScriptMetaStorageKeyPrefix,
} from "@/service_worker/storage_helpers.ts";
import {downloadFromGoogleDrive, uploadToGoogleDrive, deleteFromGoogleDrive} from "@/service_worker/drive_storage.ts";
import {parse, type UserScriptMeta} from "@/service_worker/user_script_parser.ts";

// Re-export types and functions from parser module for backward compatibility
export type {UserScript, UserScriptMeta} from "@/service_worker/user_script_parser.ts";
export {parse, determineIcon} from "@/service_worker/user_script_parser.ts";

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

const tabsMatchingUserScripts = new Map<number, string[]>();

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
                console.log('loading user script:', meta.id);
                const code = await getStorageItem<string>(
                    chrome.storage.local, userScriptStorageKey(meta.id));
                if (code) {
                    const registeredUserScript = buildRegisteredUserScript(meta.id, code);
                    console.log('registering user script:', meta.id);
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

    async function addMatchingUserScripts(tabId: number, userScriptId: string) {
        console.debug('Add matching user scripts.', 'tabId:', tabId, 'scriptId:', userScriptId);
        const matchingUserScripts = tabsMatchingUserScripts.get(tabId) || [];
        tabsMatchingUserScripts.set(tabId, matchingUserScripts);
        matchingUserScripts.push(userScriptId);
        await chrome.storage.session.set({[`tab::${tabId}::userScripts`]: matchingUserScripts});
    }
    async function clearMatchingUserScripts(tabId: number) {
        console.debug('Clearing matching user scripts.', 'tabId:', tabId);
        tabsMatchingUserScripts.delete(tabId);
        await chrome.storage.session.remove(`tab::${tabId}::userScripts`).catch(noop);
    }

    // --- sync

    chrome.storage.onChanged.addListener((changes, areaName) => {
        (async () => {
            if (areaName === 'sync') {
                for (const [_, change] of Object.entries(changes)) {
                    console.log('local sync storage change');
                    if (isLocalSyncStorageChange(change)) {
                        console.log('SKIP local sync storage change');
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
            .map(([_, value]) => value)
            .sort((a, b) => a.meta.name.localeCompare(b.meta.name));
    });
}

export async function getMatchingUserScriptIds(tabId: number): Promise<string[]> {
    return await getStorageItem<string[]>(chrome.storage.session,
        `tab::${tabId}::userScripts`) ?? [];
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

function functionCallAsString(fn: (...args: any[]) => any, ...args: Parameters<typeof fn>) {
    return `(${fn})(${args.map(arg => JSON.stringify(arg)).join(',')});`;
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