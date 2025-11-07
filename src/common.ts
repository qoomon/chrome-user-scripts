export async function sendRuntimeMessage(message: any) {
    return await chrome.runtime.sendMessage(message)
        .then((res) => {
            if (res?.error) {
                throw new Error(res.error.message ?? 'Unexpected error.');
            }
            return res;
        });
}
