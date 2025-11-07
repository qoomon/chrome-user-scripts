import {defineManifest} from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
    manifest_version: 3,
    name: 'User Scripts',
    description: "User scripts manager",
    version: pkg.version,
    icons: {
        16: "public/icon16.png",
        48: "public/icon48.png",
        128: "public/icon128.png",
    },
    background: {
        service_worker: "src/service_worker/main.ts",
        type: "module"
    },
    options_ui: {
        page: 'src/options/index.html',
        open_in_tab: true
    },
    action: {
        default_icon: {
            48: "public/icon48.png",
        },
        default_popup: 'src/popup/index.html',
    },
    incognito: 'split',
    permissions: [
        'storage',
        'userScripts',
        'activeTab',
        'webRequest',
    ],
    host_permissions: [
        "<all_urls>"
    ],
})
