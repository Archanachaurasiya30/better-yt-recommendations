# Better YT Homepage

Remove youtube distractions by giving you control over your feed.

Set up **Your custom feed** in YouTube with the topics you want to see. This
extension opens that tab whenever you visit Home, including when you click the
YouTube logo. You can still switch to other tabs whenever you want.

You'll need YouTube in English on your computer, with **Your custom feed** already
available on your account.

## Setup

1. Click **Code → Download ZIP** on this page and unzip the download.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and choose the unzipped folder containing `manifest.json`.
5. Refresh YouTube. Your custom feed will open automatically.

Keep the folder on your computer. After updating the files, click the extension's
reload button at `chrome://extensions`, then refresh YouTube.

## Privacy

The extension runs only on YouTube. It doesn't track you or collect or store your data.

## Development

No build step. Edit `content.js`, reload the extension, and refresh YouTube.

To run the checks, install Node.js 24 or later and pnpm 11, then run:

```sh
pnpm install
pnpm check
```

[MIT license](LICENSE)
