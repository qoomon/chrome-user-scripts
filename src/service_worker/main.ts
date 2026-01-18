import * as UserScripts from "@/service_worker/user_scripts.ts";

(async () => {
    await UserScripts.init();

    UserScripts.onInjection.addListener(async (tabId) => {
        const matchingUserScriptIds = await UserScripts.getMatchingUserScriptIds(tabId);
        await chrome.action.setBadgeText({
            tabId,
            text: matchingUserScriptIds.length.toString(),
        });
    });
})();

