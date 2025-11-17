export async function sendRuntimeMessage(message: any) {
    try {
        const res = await chrome.runtime.sendMessage(message);
        if (res?.error) {
            throw new Error(res.error.message ?? 'Unexpected error.');
        }
        return res;
    } catch (error) {
        // If the error is a Chrome runtime error (e.g., "Could not establish connection")
        // rethrow it with more context
        if (error instanceof Error) {
            throw new Error(`Failed to send runtime message: ${error.message}`);
        }
        throw error;
    }
}


export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;