// monaco.d.ts or global.d.ts
import * as monaco from 'monaco-editor';

// Extend the global Window object (for the main thread)
declare global {
    interface Window {
        MonacoEnvironment: monaco.Environment | undefined;
    }
}

// Extend the WorkerGlobalScope (where `self` is defined for workers)
declare global {
    interface WorkerGlobalScope {
        MonacoEnvironment: monaco.Environment | undefined;
    }
}