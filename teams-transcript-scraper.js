/*
 * Teams / SharePoint Stream — Transcript Scraper
 * ------------------------------------------------
 * Extracts the FULL transcript from a Microsoft Teams recording (SharePoint Stream player),
 * even when the Download button is disabled (you are not the organizer) and the text
 * cannot be selected with the mouse.
 *
 * Why plain "select all + copy" does not work:
 *   The transcript is a virtualized FluentUI <ms-List>. At any moment only the ~44 visible
 *   lines exist in the DOM; as you scroll, old nodes are removed and new ones are created.
 *   This script scrolls the container to the bottom by itself and collects every line by its
 *   STABLE logical index (aria-posinset), so there are no duplicates and no gaps.
 *
 * How to use:
 *   1. Open the recording and click "Read transcript" — the Transcript panel must be visible on the right.
 *   2. F12 -> Console tab.
 *   3. Paste this whole file, press Enter.
 *   4. The script scrolls the transcript by itself (progress shows in the toast at the bottom-right).
 *   5. At the end the text is copied to the clipboard. If the browser blocked the direct write
 *      (focus is on DevTools, not the page), just CLICK anywhere on the page and the text is copied.
 *
 * Also available in the console after a run:
 *   window.__transcriptText  — the full transcript (string)
 *   copyTranscript()         — copy again without re-scrolling
 *   downloadTranscript()     — download the transcript as a .txt file
 *
 * Line format:  [mm:ss] First Last (Team): spoken text
 */

(async () => {
  const CFG = {
    stepRatio: 0.8,   // fraction of the viewport height per scroll step
    waitMs:    150,   // how long to hold each target position, ms (increase if lines are missed)
    maxLoops:  1500,  // safety guard against an infinite loop
    stableMax: 5,     // how many steps with no new lines count as the end
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);

  // --- status toast at the bottom-right ---
  let toast = document.getElementById('__ttToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = '__ttToast';
    toast.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:380px;' +
      'padding:12px 14px;background:#201f1e;color:#fff;font:13px/1.45 "Segoe UI",system-ui,sans-serif;' +
      'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.4);white-space:pre-wrap';
    document.body.appendChild(toast);
  }
  const say = (m, c) => { toast.textContent = m; if (c) toast.style.background = c; console.log('[Teams-Transcript]', m); };

  // --- transcript scroll container ---
  const scroller = $('#scrollToTargetTargetedFocusZone') ||
    [...document.querySelectorAll('[data-is-scrollable="true"]')].find(el => el.querySelector('[id^="sub-entry-"]'));
  if (!scroller) {
    say('❌ Transcript not found.\nOpen the Transcript panel ("Read transcript") and run again.', '#a4262c');
    return;
  }

  // --- collect lines ---
  const map = new Map(); // key = aria-posinset (stable logical index of a line)
  const stripTime = s => (s || '').replace(/\s*\d+\s+(hour|minute|second)s?\b.*$/i, '').trim();
  const tsFromLabel = label => {
    const h = /(\d+)\s+hour/.exec(label || ''), m = /(\d+)\s+minute/.exec(label || ''), s = /(\d+)\s+second/.exec(label || '');
    if (!h && !m && !s) return null;
    const H = h ? +h[1] : 0, M = m ? +m[1] : 0, S = s ? +s[1] : 0, p = n => String(n).padStart(2, '0');
    return H > 0 ? `${H}:${p(M)}:${p(S)}` : `${M}:${p(S)}`;
  };
  const harvest = () => {
    for (const sub of document.querySelectorAll('[id^="sub-entry-"]')) {
      const pos = +sub.getAttribute('aria-posinset');
      if (!pos || map.has(pos)) continue;
      const group = sub.closest('[role="group"]');           // carries aria-label "Speaker X minutes Y seconds"
      const label = group ? group.getAttribute('aria-label') : '';
      map.set(pos, { pos, ts: tsFromLabel(label), speaker: stripTime(label), text: sub.innerText.replace(/\s+/g, ' ').trim() });
    }
  };

  // --- scroll from top to bottom (monotonic: the target only grows) ---
  // The list is virtualized and, on re-render / auto-sync with the video, tends to pull the
  // position back up. So we only increase the target position and "hold" it with short
  // re-assertions during the pause — pull-backs are corrected within ~30 ms, no jitter.
  const holdTarget = async (target, ms) => {
    for (let t = 0; t < ms; t += 30) {
      if (scroller.scrollTop < target - 4) scroller.scrollTop = target;
      await sleep(30);
    }
  };
  scroller.scrollTop = 0;
  await sleep(300);
  harvest();
  const setsize = +($('[id^="sub-entry-"]')?.getAttribute('aria-setsize') || 0); // total lines, if known
  const step = Math.max(200, Math.round(scroller.clientHeight * CFG.stepRatio));
  let target = 0, loops = 0, last = 0, stagn = 0;
  while (loops < CFG.maxLoops) {
    loops++;
    target += step;
    scroller.scrollTop = target;
    await holdTarget(target, CFG.waitMs);
    harvest();
    if (loops % 8 === 0) say(`⏳ Collecting transcript… ${map.size}${setsize ? '/' + setsize : ''}`);
    if (setsize && map.size >= setsize) break;                 // collected every known line
    stagn = (map.size === last) ? stagn + 1 : 0; last = map.size;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    if (stagn >= CFG.stableMax && (atBottom || stagn >= CFG.stableMax * 2)) break; // no new lines = end
  }

  // --- build the text ---
  const rows = [...map.values()].sort((a, b) => a.pos - b.pos);
  const lines = rows.map(e =>
    e.ts && e.speaker ? `[${e.ts}] ${e.speaker}: ${e.text}` :
    e.speaker         ? `${e.speaker}: ${e.text}` :
                        e.text);
  const text = lines.join('\n');

  // --- helpers for reuse ---
  window.__transcriptText = text;
  window.copyTranscript = async () => {
    try { await navigator.clipboard.writeText(text); say(`✅ Copied to clipboard: ${lines.length} lines.`, '#107c10'); return true; }
    catch (e) { say('⚠️ Clipboard blocked by the browser. Click the page and try again, or downloadTranscript().', '#a4262c'); return false; }
  };
  window.downloadTranscript = () => {
    const b = new Blob([text], { type: 'text/plain;charset=utf-8' }), u = URL.createObjectURL(b), a = document.createElement('a');
    a.href = u; a.download = (document.title || 'transcript').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) + '.txt';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
  };

  // --- copy to clipboard ---
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {}
  if (copied) {
    say(`✅ Done! ${lines.length} lines copied to the clipboard.`, '#107c10');
  } else {
    // the browser requires a user gesture (focus is on DevTools, not the page) — copy on the first click
    say(`✅ Collected ${lines.length} lines.\n👉 Click anywhere on the page — the text will be copied to the clipboard.\n(or call downloadTranscript() for a .txt)`, '#0b6a0b');
    const onGesture = async () => {
      const ok = await window.copyTranscript();
      if (ok) { document.removeEventListener('click', onGesture, true); document.removeEventListener('keydown', onGesture, true); }
    };
    document.addEventListener('click', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
  }

  console.log(`[Teams-Transcript] collected ${lines.length} lines, ${text.length} chars`);
})();
