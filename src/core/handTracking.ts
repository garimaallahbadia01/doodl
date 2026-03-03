export const handWorker = new Worker(new URL('./handWorker.ts', import.meta.url), { type: 'module' });
let initPromise: Promise<void> | null = null;

export async function initHandTracking() {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
        const initListener = (e: MessageEvent) => {
            if (e.data.type === 'INIT_DONE') {
                handWorker.removeEventListener('message', initListener);
                resolve();
            } else if (e.data.type === 'INIT_ERROR') {
                handWorker.removeEventListener('message', initListener);
                reject(e.data.error);
            }
        };

        handWorker.addEventListener('message', initListener);
        handWorker.postMessage({ type: 'INIT' });
    });

    return initPromise;
}
