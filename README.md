# Grok Watch

Chrome toolbar popup for Grok usage, plus an optional floating panel on grok.com.

The look is original. The metering follows the same grok.com calls used by [Grok Usage Watch](https://github.com/JoshuaWang2211/grok-usage-watch), with extra breakdowns cross-checked against Grok Quota Display Pro, the nisc / BlueSkyXN rate-limit scripts, and the public credits protobuf notes (product ids, weekly period, banked resets).

## What you see

| Signal | Source | Shown when |
| --- | --- | --- |
| Weekly pool | `GetGrokCreditsConfig` | Paid plan. Percent left, used, period start and reset countdown |
| Grok Bot | `POST https://cursor.com/api/dashboard/get-sand-usage-status` | Separate weekly pool. Shown when this browser is signed in at cursor.com. Not the SuperGrok product split |
| Product split | same response, per product | Chat, Imagine, Voice, Grok Build, API, Plugins, App Builder, Automations, and any other id the account reports |
| Query windows | `POST /rest/rate-limits` | Fast, Think, DeepSearch, DeeperSearch, Expert, Auto, Heavy — only rows the API actually returns. Identical numbers are merged |
| Window length | `windowSizeSeconds` | Next to each query row, when grok.com sends it |
| Banked resets | `GetRemainingResets` | Count and soonest expiry. Nothing is redeemed from this extension |

Free accounts get the query windows (Fast is the headline). Paid accounts get the weekly pool as the headline, plus any real query windows underneath.

While a refresh is in flight the header orb speeds up — three satellites on a ring, the same kind of “still working” motion as Grok while a prompt is running.

## Floating panel

Off by default. In the popup, turn on **Floating panel**. A draggable card then sits on [grok.com](https://grok.com), the same idea as [Grok Usage Watch](https://github.com/JoshuaWang2211/grok-usage-watch):

- Drag the header to move it. Drag the corner to resize. Both are remembered.
- Long names, like merged query modes, stay on one line and clip. Hover a name to read it all.
- **−** collapses it to a small readout. Click that chip to open it again.
- **↻** refreshes. **×** hides it (same as turning the switch off).

It shows the same numbers as the popup. It does not redeem resets.

## Install

1. Clone this repo, or download it as a ZIP and unzip it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. **Load unpacked** and choose this folder.
5. Pin **Grok Watch**.
6. Be signed in at [grok.com](https://grok.com). For the Bot meter, also be signed in at [cursor.com](https://cursor.com).

The Bot request is one POST from this extension, using the cursor.com cookie already in the browser. The response stays in `chrome.storage.local`. Nothing is sent to a third party, and no reset or credit is spent.

If you already loaded an older build, click **Reload** on the extension card after pulling.

If a grok.com tab is open, requests go through that page so they use the site session. Otherwise the extension calls grok.com directly with the same cookies. Results stay in `chrome.storage.local` for 60 seconds.

## Privacy

No analytics. Calls go only to `grok.com` and, for the Bot meter, one POST to `cursor.com`. Reset tokens are counted, never spent.

## Credits

- [JoshuaWang2211/grok-usage-watch](https://github.com/JoshuaWang2211/grok-usage-watch) (MIT) — weekly pool vs free Fast detection. See [NOTICE.md](NOTICE.md).
- [titanlyy/perplexity-limits](https://github.com/titanlyy/perplexity-limits) — popup-only dashboard, not an on-page overlay.

## License

MIT
