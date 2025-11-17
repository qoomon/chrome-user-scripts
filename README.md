# User Script Manager for Chrome

A Chrome extension for managing and running user scripts, similar to Tampermonkey or Greasemonkey.



[!["Available in the Chrome Web Store"](https://developer.chrome.com/static/docs/webstore/branding/image/tbyBjqi7Zu733AAKA5n4.png)](https://chromewebstore.google.com/detail/ihgmdcaijidjdmngpnbdkdefhocmkdhc)

## Features

- 📝 Create and edit user scripts with syntax highlighting
- 🔄 Automatic script synchronization across devices
- ⚡ Fast script injection using Chrome's userScripts API
- 🎨 Modern, user-friendly interface
- 🔒 Secure script storage with compression


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

- `src/popup/` - Extension popup UI
- `src/options/` - Extension options page with script editor
- `src/service_worker/` - Background service worker for script management
- `src/components/` - Reusable Vue components
- `manifest.config.ts` - Chrome extension manifest configuration

## Documentation

- [Vue 3 Documentation](https://vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [CRXJS Documentation](https://crxjs.dev/vite-plugin)

## Chrome Extension Development Notes

- Use `manifest.config.ts` to configure your extension
- The CRXJS plugin automatically handles manifest generation
- Service worker scripts should be placed in `src/service_worker/`
- Popup UI should be placed in `src/popup/`
- Options page should be placed in `src/options/`
