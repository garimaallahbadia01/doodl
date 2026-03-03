export const handWorker = new Worker(new URL('./handWorker.ts', import.meta.url), { type: 'module' });
let initPromise: Promise<void> | null = null;

export async function initHandTracking() {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
        const initListener = (e: MessageEvent) => {
            if (e.data.type === 'LOG') {
                console.log('[Worker]:', e.data.msg);
            } else if (e.data.type === 'INIT_DONE') {
                handWorker.removeEventListener('message', initListener);
                resolve();
            } else if (e.data.type === 'INIT_ERROR') {
                handWorker.removeEventListener('message', initListener);
                reject(e.data.error);
            }
        };

        handWorker.onerror = (err) => {
            console.error("Worker generic error:", err);
            reject(new Error(err.message || 'Worker thread crashed'));
        };

        handWorker.addEventListener('message', initListener);
        handWorker.postMessage({ type: 'INIT' });
    });

    return initPromise;
}
