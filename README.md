# User Script Manager for Chrome

[!["Available in the Chrome Web Store"](https://developer.chrome.com/static/docs/webstore/branding/image/tbyBjqi7Zu733AAKA5n4.png)](https://chromewebstore.google.com/detail/ihgmdcaijidjdmngpnbdkdefhocmkdhc)

This is a Chrome extension that allows you to manage and run user scripts directly in your browser. 
It provides an easy-to-use interface for installing, organizing, and executing custom scripts to enhance your browsing experience.

[Privacy Policy](application_privacy_policy.md) | [Terms of Service](application_terms_of_service.md)

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

## TODO's
- https://developers.google.com/workspace/drive/api/guides/appdata#node.js
- extension id: ihgmdcaijidjdmngpnbdkdefhocmkdhc