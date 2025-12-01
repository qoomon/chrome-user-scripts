# User Script Manager for Chrome

[!["Available in the Chrome Web Store"](https://developer.chrome.com/static/docs/webstore/branding/image/tbyBjqi7Zu733AAKA5n4.png)](https://chromewebstore.google.com/detail/ihgmdcaijidjdmngpnbdkdefhocmkdhc)

This is a Chrome extension that allows you to manage and run user scripts directly in your browser. 
It provides an easy-to-use interface for installing, organizing, and executing custom scripts to enhance your browsing experience.

[Privacy Policy](application_privacy_policy) | [Terms of Service](application_terms_of_service)

# Development

## Quick Start

1. Install dependencies:

    ```bash
    npm install
    ```

2. Start development server:

    ```bash
    npm run dev
    ```

3. Open Chrome and navigate to `chrome://extensions/`, enable "Developer mode", and load the unpacked extension from the `dist` directory.

4. Build for production:

    ```bash
    npm run build
    ```

## Project Structure
- `manifest.config.ts` - Chrome extension manifest configuration
- `src/options/` - Extension option UI
- `src/popup/` - Extension popup UI

## Documentation

- [Vue 3 Documentation](https://vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [CRXJS Documentation](https://crxjs.dev/vite-plugin)

## Dev Links
- extension id: **ihgmdcaijidjdmngpnbdkdefhocmkdhc**
- Delete extension data in google drive 
  - go to https://drive.google.com/drive/settings
  - disconnect "Chrome User Scripts" app
- https://console.cloud.google.com/auth/overview?project=chrome-user-scripts
- https://chrome.google.com/webstore/devconsole/ad94a22f-cce4-4924-9b70-818b360a08f9/ihgmdcaijidjdmngpnbdkdefhocmkdhc/edit


## ToDo's
- handle offline situation
- show toast on add/save success or error (bottom left corner see chrome extesion )
- make identity permission an optional one. only request when user enables sync
  https://developer.chrome.com/docs/extensions/reference/api/permissions#step-2-declare-optional-permissions-in-the-manifest
  ```
  chrome.permissions.request({permissions: ['identity']})
  chrome.permissions.request({origins: ['<all_urls>']})
  ```
- logout
    ```js
    await fetch('https://accounts.google.com/o/oauth2/revoke?token=' + token);
    await chrome.identity.removeCachedAuthToken({token: token});
    ```