# Teams Transcript Scraper

Extracts the **full** transcript from a Microsoft Teams recording (SharePoint Stream player)
when the **Download** button is disabled (you are not the organizer) and the text **cannot be
selected with the mouse**.

## How it works (in short)

You run the script once — paste it into the DevTools Console, or click the bookmarklet. From
there it is fully automatic:

1. It scrolls the transcript from top to bottom on its own, in small continuous steps.
2. As it scrolls, it grabs every new line that appears — Teams keeps only the visible lines in
   the page, so the collecting happens **during** the scrolling.
3. When it reaches the bottom, the **whole transcript is copied to your clipboard**. Paste it
   anywhere with `Ctrl/Cmd+V`.

## Why this is needed

The transcript panel in Stream is a **virtualized list** (FluentUI `ms-List`). At any moment
only the ~44 visible lines exist in the DOM: as you scroll, old lines are **removed** and new
ones are **created**. So a plain "select all → copy" only grabs a small slice.

The script solves this by:
- finding the transcript scroll container (`#scrollToTargetTargetedFocusZone`);
- scrolling it from top to bottom by itself, **monotonically** (the target only grows and is
  held, so the list's attempts to "bounce" back up on re-render are corrected within ~30 ms,
  with no jitter);
- after every step, reading the visible lines and storing them in a `Map` keyed by the
  **stable logical index** `aria-posinset` (1…N) → **no duplicates, no gaps**;
- knowing the total line count from `aria-setsize`, so it knows exactly when it reached the end;
- assembling everything into text and putting it on the **clipboard**.

Verified on a real recording: collected **312 of 312** lines, 0 gaps.

## Method 1. Console (recommended)

1. Open the recording and click **"Read transcript"** — the **Transcript** panel must be visible on the right.
2. Press **F12** → **Console** tab.
3. Open [`teams-transcript-scraper.js`](teams-transcript-scraper.js), copy the **whole** file,
   paste it into the console, press **Enter**.
4. The script scrolls the transcript by itself (progress shows in the toast at the bottom-right).
5. At the end the text is copied to the clipboard. If the browser blocked the direct write
   (focus is on DevTools, not the page) — **just click anywhere on the page** and the text is
   copied. After that `Ctrl/Cmd+V` pastes the transcript anywhere.

## Method 2. Bookmarklet (one click, no console)

1. Create a new bookmark (Bookmarks → Add / `Ctrl+D`), any name, e.g. `Get Transcript`.
2. Paste the entire contents of [`bookmarklet.txt`](bookmarklet.txt) into the **URL** field
   (it starts with `javascript:`) and save.
3. On the recording page, with the Transcript panel open, click the bookmark.
4. Then it is the same as Method 1: wait for the scroll and, if prompted, click the page to copy.

> If the browser strips the `javascript:` prefix when pasting into the address bar, add the
> bookmark through the **bookmark manager** instead (it pastes in full there).

## Output format

```
[0:03] Jordan Avery (Team A - Remote): Could you walk us through the plan for this release?
[0:03] Priya Nair (Team B - Office): Sure — I'll share the summary now.
[0:11] Jordan Avery (Team A - Remote): Thanks, that covers it; let's move to the next item.
```

`[mm:ss] First Last (Team): text`. For long recordings the timestamp becomes `[h:mm:ss]`.

## Available in the console after a run

| Command | Action |
|---|---|
| `window.__transcriptText` | the full transcript as a string |
| `copyTranscript()` | copy again (without re-scrolling) |
| `downloadTranscript()` | download as `.txt` |

## Troubleshooting

- **"Transcript not found"** — the Transcript panel is not open. Click "Read transcript" and run again.
- **Some lines seem missing** — increase the hold time: at the top of the script `waitMs: 150` → `300`
  (on a slow machine the list does not re-render in time). Run again.
- **Very long meeting (hours)** — raise `maxLoops` if needed.
- **Clipboard does not copy even after a click** — use `downloadTranscript()` or copy
  `window.__transcriptText` manually (right-click → Copy string in the console).

## How it works (for maintenance)

Key selectors (current as of writing; Microsoft changes the markup periodically):

| What | Selector |
|---|---|
| Scroll container | `#scrollToTargetTargetedFocusZone` (fallback: `[data-is-scrollable="true"]` containing lines) |
| Line (text) | `[id^="sub-entry-"]`, attributes `aria-posinset` / `aria-setsize` |
| Speaker + time | `aria-label` of the nearest `[role="group"]` (`entry-N`), e.g. "Name 0 minutes 7 seconds" |

If Teams changes the classes/ids, fix these three spots in [`teams-transcript-scraper.js`](teams-transcript-scraper.js).
