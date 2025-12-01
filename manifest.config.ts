import {defineManifest} from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
    manifest_version: 3,
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA84apGKSVEmfI/Q2v51v8NBc6MwoTlfbqPEsk0vZnNP299ShDonB4AXnErH2LSOzzxyxrn0braR5p8S9h1yNb0NYMPO90FWOb4A8sM5jNi0DtpBQqQDtMI/n630MSnIpY6TVeA/7Ce+MAd39Sp9kCo7bhlZNmZJC2WZu673IygD5tdhmZQkrVeA5/8mPk94SnJHzBJDLc2ZNATGb2O17b8zcf8MvxaNBB/mheoXLbjRKkW9fkdGw2nob6XKscjUFY4E0kcreyi64cn9Hncph0OW4Qtx0VrbkuOZCAx4l8oMUlcHxdXsEYrOUvoSxcP/ek/LVwv5ShWlx7RWHzSHgh7QIDAQAB",
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
        'userScripts',
        'storage',
        'unlimitedStorage',
        'identity',
        // 'webRequest',
        'declarativeNetRequest'
    ],
    host_permissions: [
        "<all_urls>"
    ],
    declarative_net_request: {
        rule_resources: [{
            id: "user_scripts_handler",
            enabled: true,
            path: "user_scripts_handler_rule.json"
        }]
    },
    // optional_permissions: [
    //     'identity',
    //     'webRequest',
    // ],
    // optional_host_permissions: [
    //     "<all_urls>",
    // ],
    oauth2: {
        client_id: "289450459678-g29onfh4s94210jg5unp2ik4a13mt1pb.apps.googleusercontent.com",
        scopes: [
            "https://www.googleapis.com/auth/drive.appdata"
        ]
    },
})
