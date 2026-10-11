# Grok Watch

A Chrome extension that shows your Grok usage in the toolbar popup — the same dark dashboard style as [Perplexity Limits](https://github.com/titanlyy/perplexity-limits), with the monitoring behavior of [Grok Usage Watch](https://github.com/JoshuaWang2211/grok-usage-watch).

There is no floating panel. Click the toolbar icon.

## What you see

Grok meters free and paid accounts differently. The popup follows whichever one applies.

| Account | Popup shows |
| --- | --- |
| Free | Fast queries left, out of the window total |
| Paid plan | Weekly pool — percent left, when it resets, and the split across Chat, Imagine, Voice, and Grok Build |

Paid plans share one weekly allowance. A chat costs little; images and video cost more. The product rows are shares of that pool, not separate caps.

## Install

1. Clone this repo, or download it as a ZIP and unzip it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose this folder.
5. Pin **Grok Watch**.
6. Be signed in at [grok.com](https://grok.com) in the same browser, then click the icon.

If a grok.com tab is already open, the extension reads usage from that page so the request looks like the site itself. Otherwise it calls grok.com directly with your existing session.

## How it works

```
manifest.json       Chrome MV3 manifest. Host access is limited to grok.com.
background.js       Decides free vs paid, fetches usage, caches it locally.
content-script.js   On grok.com only. No UI. Forwards the page's own session.
popup/              Toolbar popup: cards, bars, product rows, refresh.
icons/              Toolbar icons.
```

- Paid weekly usage comes from `GetGrokCreditsConfig` on grok.com.
- Free Fast quota comes from `POST /rest/rate-limits`.
- Which path to use comes from `GET /rest/subscriptions`.
- Results stay in `chrome.storage.local` for 60 seconds. Nothing is sent anywhere else.

Refresh is the button in the popup. A failed refresh keeps the last good snapshot instead of blanking it. Signing out shows a sign-in prompt immediately.

## Privacy

- No analytics, no remote code, no extra servers.
- The only network calls are to `grok.com`, using the session you already have.
- Usage numbers never leave the browser.

## Credits

- Visual design follows [titanlyy/perplexity-limits](https://github.com/titanlyy/perplexity-limits).
- Quota detection follows [JoshuaWang2211/grok-usage-watch](https://github.com/JoshuaWang2211/grok-usage-watch) (MIT). See [NOTICE.md](NOTICE.md).

## License

MIT
