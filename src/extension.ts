const extensionInstallIdStorageKey = 'extension::installationId';

let installationId: string = '';

(async () => {
    if(installationId) return;
    console.debug('Extension initialized');

    installationId = await chrome.storage.local.get(extensionInstallIdStorageKey)
        .then((data) => data?.[extensionInstallIdStorageKey]);

    if(!installationId) {
        installationId = crypto.randomUUID();
        await chrome.storage.local.set({[extensionInstallIdStorageKey]: installationId});
    }
})();

export default {
    installationId
} as const
