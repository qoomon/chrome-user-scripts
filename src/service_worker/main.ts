import * as UserScripts from "@/service_worker/user_scripts.ts";

(async () => {
    await UserScripts.getConfig();
})();

chrome.action.onClicked.addListener(async () => {
    await chrome.runtime.openOptionsPage();
})

// --- Tab user scripts tracking ---
const tabsUserScriptIds = {} as Record<string, string[]>;

chrome.runtime.onUserScriptMessage.addListener(async (message, sender) => {
    console.debug("runtime.onUserScriptMessage", {sender, message});
    const tabId = sender.tab?.id;
    if (!tabId) return;

    if (message.event === 'USER_SCRIPT_INJECTED') {
        const tabUserScriptIds = tabsUserScriptIds[tabId] ??= [];
        tabUserScriptIds.push(message.userScriptId);
        await chrome.action.setBadgeText({
            tabId,
            text: tabUserScriptIds.length.toString(),
        });
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    console.log("tab", tabId, "removed");
    delete tabsUserScriptIds[tabId];
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    console.log("tab", tabId, "updated:", changeInfo);
    if (changeInfo.status === 'loading') {
        delete tabsUserScriptIds[tabId];
    }
});

chrome.webRequest.onBeforeRequest.addListener(({method, tabId, url}) => {
    if (method !== 'GET') return;

    const createScriptUrl = `chrome-extension://${chrome.runtime.id}/src/options/index.html?url=${encodeURIComponent(url)}`;
    chrome.tabs.update(tabId, {url: createScriptUrl});
    return {redirectUrl: createScriptUrl};
}, {
    urls: [
        // 1. *:// comprises only http  /https
        // 2. the API ignores #hash part
        '*://*/*.user.js',
        '*://*/*.user.js?*',
    ],
    types: ['main_frame'],
});


// https://developer.chrome.com/docs/extensions/reference/api/userScripts?hl=de#type-RegisteredUserScript
// await chrome.userScripts.update(
//     Object.entries(userScripts)
//         .filter(([id, userScript]) => !userScript.disable)
//         .map(([id, userScript]) => ({
//             // defaults
//             world: 'MAIN',
//             runAt: 'document_idle',
//             ...userScript,
//             id,
//         })));
//

// TODO
// self.addEventListener('fetch', (event) => {
//     const url = new URL(event.request.url);
//
//     console.log(`Fetch event for: ${url.href}`);
//     return;
//
//     event.respondWith(
//         (async () => {
//             // 1. Try to find the resource in the cache
//             const cachedResponse = await caches.match(event.request);
//
//             if (cachedResponse) {
//                 // Cache hit: return the cached response instantly
//                 console.log(`[Cache-First] Hit: ${url.pathname}`);
//                 return cachedResponse;
//             }
//
//             // Cache miss: go to the network
//             console.log(`[Cache-First] Miss, fetching from network: ${url.pathname}`);
//             const networkResponse = await fetch(event.request);
//
//             // OPTIONAL: Cache the new response for next time
//             const cache = await caches.open(CACHE_NAME);
//             // Clone the response before putting it in the cache
//             await cache.put(event.request, networkResponse.clone());
//
//             return networkResponse;
//         })()
//     );
// });

// function onMessageAsyncListenerWrapper(callback: (message: any, sender: chrome.runtime.MessageSender) => any)
//     : Parameters<typeof chrome.runtime.onMessage.addListener>[0] {
//     return (message, sender, sendResponse) => {
//         const sendError = (error: any) => {
//             console.error(error);
//             sendResponse({error});
//         };
//
//         try {
//             const result = callback(message, sender);
//             if (result instanceof Promise) {
//                 result.then(sendResponse)
//                     .catch(sendError);
//                 return true; // Indicate that we will send a response asynchronously
//             }
//         } catch (error: any) {
//             sendError(error.message ?? 'Unexpected error');
//         }
//     };
// }

