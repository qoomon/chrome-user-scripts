import * as UserScripts from "@/service_worker/user_scripts.ts";

chrome.runtime.onStartup.addListener(() => {
    UserScripts.load().catch((error) => {
        console.error('Failed to load user scripts on startup:', error);
    });
})

chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
})

// Intercept .user.js file requests and redirect to the options page for installation
chrome.webRequest.onBeforeRequest.addListener(({method, tabId, url}) => {
    if (method !== 'GET') return;

    const createScriptUrl = `chrome-extension://${chrome.runtime.id}/src/options/index.html?url=${encodeURIComponent(url)}`;
    chrome.tabs.update(tabId, {url: createScriptUrl}).catch((error) => {
        console.error('Failed to redirect to options page:', error);
    });
    return {redirectUrl: createScriptUrl};
}, {
    urls: [
        // Note: *:// comprises only http/https
        // The API ignores #hash part
        '*://*/*.user.js',
        '*://*/*.user.js?*',
    ],
    types: ['main_frame'],
});
