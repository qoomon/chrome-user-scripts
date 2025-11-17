export async function sendRuntimeMessage(message: any) {
    return await chrome.runtime.sendMessage(message)
        .then((res) => {
            if (res?.error) {
                throw new Error(res.error.message ?? 'Unexpected error.');
            }
            return res;
        });
}


export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;