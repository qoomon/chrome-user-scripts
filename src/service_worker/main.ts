import * as UserScripts from "@/service_worker/user_scripts.ts";

console.log('Service worker init');

(async () => {
    await UserScripts.init();

    // --- Update badge when user scripts are injected ---
    chrome.runtime.onUserScriptMessage.addListener(async (message, sender) => {
        const tabId = sender.tab?.id;
        if (!tabId) return;

        if (message.event === 'USER_SCRIPT_INJECTED') {
            const matchingUserScriptIds = await UserScripts.getMatchingUserScriptIds(tabId);
            await chrome.action.setBadgeText({
                tabId,
                text: matchingUserScriptIds.length.toString(),
            });
        }
    });

//     // --- Handle *.user.js files with this extension ---
//     chrome.webRequest.onBeforeRequest.addListener(
//         ({method, tabId, url}) => {
//             if (method === 'GET') {
//                 const createScriptUrl = `chrome-extension://${chrome.runtime.id}/src/options/index.html`
//                     + `?url=${encodeURIComponent(url)}`;
//                 chrome.tabs.update(tabId, {url: createScriptUrl});
//                 return {redirectUrl: createScriptUrl};
//             }
//         },
//         {
//             types: ['main_frame'],
//             urls: [
//                 '*://*/*.user.js',
//                 '*://*/*.user.js?*',
//             ],
//         });
})();


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


