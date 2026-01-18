const extensionInstallIdStorageKey = 'extension::installationId';

let installationId: string = '';

(async () => {
    if(installationId) return;

    installationId = await chrome.storage.local.get(extensionInstallIdStorageKey)
        .then((data) => data?.[extensionInstallIdStorageKey] as string ?? '');

    if(!installationId) {
        installationId = crypto.randomUUID();
        await chrome.storage.local.set({[extensionInstallIdStorageKey]: installationId});
    }
})();

export default {
    installationId,
} as const
