// content.js

const SKIPCUT_BADGE_CLASS = 'skipcut-shortcut-badge';
const SKIPCUT_BADGE_ATTR = 'data-skipcut-badge-bound';
const NI_BADGE_CLASS = 'skipcut-ni-badge';
const NI_KEY = 'skipcut:notInterested';

function videoIdOf(rawUrl) {
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const v = parsed.searchParams.get('v');
    if (v) return v;
    const m = parsed.pathname.match(/^\/(?:shorts\/)?([\w-]{6,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// pierce polymer shadow roots, bounded
function deepFind(scope, test, cap) {
  if (!scope) return null;
  const seen = [];
  const walk = (node) => {
    for (const el of node.children || []) {
      if (seen.length++ >= cap) return null;
      if (test(el)) return el;
      if (el.shadowRoot) { const r = walk(el.shadowRoot); if (r) return r; }
    }
    return null;
  };
  return walk(scope);
}

// YouTube's own "不感興趣 / Not interested" item, and its data-feedback-token
function findDismissInfo(card) {
  const root = card && card.closest ? (card.closest('rich-item') || card) : card;
  let hit = null;
  const seen = [];
  const walk = (node) => {
    for (const el of node.children || []) {
      if (seen.length++ >= 400) return;
      if (!hit && el.hasAttribute && el.hasAttribute('data-feedback-token')) {
        const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
        const t = (el.textContent || '').trim();
        if (/不感興趣|not interested/i.test(aria) || /不感興趣|not interested/i.test(t)) hit = el;
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root);
  return hit;
}

// collect all elements, piercing every open shadow root (bounded)
function allElements(root, cap) {
  const out = [];
  const q = [root];
  while (q.length && out.length < cap) {
    const node = q.shift();
    if (!node) continue;
    for (const el of node.children || []) {
      if (out.length >= cap) return out;
      out.push(el);
      if (el.shadowRoot) q.push(el.shadowRoot);
    }
  }
  return out;
}

// force the watch-page player's control bar (and its ⋮ button) to render
function revealPlayerControls() {
  return new Promise((resolve) => {
    const p = document.querySelector('ytd-player');
    const hover = (el) => {
      if (!el) return;
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    };
    // the <video> lives in the shadow root; p.video is the real element
    hover(p ? p.video : null);
    hover(document.querySelector('video'));
    hover(p ? p.querySelector('#player') : null);
    hover(p);
    // also poke the shadow control bar directly
    if (p && p.shadowRoot) {
      hover(p.shadowRoot.querySelector('#controls, #ytd-watch-ability-renderer #actions'));
    }
    setTimeout(resolve, 350);
  });
}

// the "更多 / More" context-menu button (3-dot). Works on feed cards AND the watch-page player.
function findMenuButton(card) {
  const match = (el) => {
    if (!el.hasAttribute) return false;
    if (el.id === 'ytp-context-menu-button' ||
        el.classList && el.classList.contains('ytp-context-menu-button')) return true;
    const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
    return el.tagName === 'BUTTON' && /^(更多|More)$/i.test(aria.trim());
  };
  // watch page fast path: look straight in ytd-player's shadow root (small, won't exhaust a big BFS)
  const p = document.querySelector('ytd-player');
  if (p && p.shadowRoot) {
    const inShadow = allElements(p.shadowRoot, 4000);
    const hit = inShadow.find(match);
    if (hit) return hit;
    const btns = inShadow.filter((e) => e.tagName === 'BUTTON');
    const labels = btns.slice(0, 14).map((e) => (e.getAttribute('aria-label') || e.id || e.className || '?').toString().slice(0, 28));
    console.log('[skipcut] player shadow: buttons=', btns.length, 'labels=', JSON.stringify(labels));
  } else {
    console.log('[skipcut] player shadow: player=', !!p, 'shadowRoot=', !!(p && p.shadowRoot));
  }
  // feed cards / other: full-document shadow-piercing search
  const roots = [document.documentElement];
  if (card) roots.unshift(card);
  for (const root of roots) {
    const pool = allElements(root, 6000);
    const hit = pool.find(match);
    if (hit) return hit;
  }
  return null;
}

// menu items (with data-feedback-token) appear once the menu opens — may be in a shadow root
function findTokenInDoc() {
  const pool = allElements(document.documentElement, 8000);
  for (const el of pool) {
    if (el.hasAttribute && el.hasAttribute('data-feedback-token')) {
      const t = (el.textContent || '').trim();
      if (/不感興趣|not interested/i.test(t) || /不感興趣|not interested/i.test(el.getAttribute('aria-label') || '')) return el;
    }
  }
  return null;
}

function waitForToken(ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const el = findTokenInDoc();
      if (el) { clearInterval(iv); resolve(el); }
      else if (Date.now() - t0 >= ms) { clearInterval(iv); resolve(null); }
    }, 80);
  });
}

function closeMenus() {
  const esc = (el) => {
    if (!el) return;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
  };
  esc(document);
  esc(document.activeElement);
  const p = document.querySelector('ytd-player');
  if (p && p.shadowRoot) esc(p.shadowRoot);
}

// page's own innertube key + context (never from outside, never stored)
function appInnerTube() {
  const app = document.querySelector('ytd-app');
  if (!app) return null;
  const key = app.getAttribute('innertube-api-key') || app.innertubeApiKey || '';
  if (!key) return null;
  let context = null;
  try {
    const raw = app.getAttribute('innertube-context') || app.innertubeContext || '';
    if (raw) context = JSON.parse(raw);
  } catch (e) { context = null; }
  return { key, context };
}

// call YouTube's own feedback endpoint with the card's token
function sendNotInterested(token, pill) {
  const it = appInnerTube();
  if (!it) { pill.textContent = '已不收'; pill.style.color = '#8b9bb0'; return; }
  const ver = it.context && it.context.client && it.context.client.clientVersion;
  const context = it.context || {
    client: { clientName: 'WEB', clientVersion: ver || '2.20260101.00.00', hl: document.documentElement.lang || 'zh-TW' }
  };
  fetch(`https://www.youtube.com/youtubei/v1/feedback?key=${encodeURIComponent(it.key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ context, feedbackToken: token, isFeedbackGiven: true })
  }).then((r) => {
    return r.text().then((txt) => {
      console.log('[skipcut] feedback http', r.status, (txt || '').slice(0, 300));
      if (!r.ok) throw new Error('http ' + r.status + ' ' + txt.slice(0, 160));
      return JSON.parse(txt || '{}');
    });
  }).then(() => {
    pill.textContent = '已不收';
    pill.style.color = '#8b9bb0';
    pill.title = `已回報 YouTube（${new Date().toLocaleTimeString()}）`;
  }).catch(() => {
    pill.textContent = '已不收';
    pill.style.color = '#8b9bb0';
    pill.title = '本地已標記；YouTube 回報失敗，可用卡片的 ⋮ 手動處理';
  });
}

function notInterestedStore(cb) {
  chrome.storage.local.get({ [NI_KEY]: {} }, (res) => cb((res && res[NI_KEY]) || {}));
}

function isYoutubeVideoLink(rawUrl) {
  if (!rawUrl) return false;

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch' && parsed.searchParams.get('v')) return true;
      if (parsed.pathname.startsWith('/shorts/')) return true;
      return false;
    }

    if (host === 'youtu.be') {
      return parsed.pathname.length > 1;
    }

    return false;
  } catch {
    return false;
  }
}

function addSkipCutShortcut(link) {
  if (!link || link.getAttribute(SKIPCUT_BADGE_ATTR) === 'true') return;
  if (!isYoutubeVideoLink(link.href)) return;

  const style = getComputedStyle(link);
  if (style.display === 'inline') {
    link.style.display = 'inline-block';
  }

  if (style.position === 'static') {
    link.style.position = 'relative';
  }

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = SKIPCUT_BADGE_CLASS;
  badge.textContent = 'SkipCut';
  badge.title = 'Open in SkipCut (and keep YouTube in background)';

  Object.assign(badge.style, {
    position: 'absolute',
    right: '8px',
    bottom: '8px',
    zIndex: '9999',
    padding: '4px 8px',
    border: 'none',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '700',
    color: '#fff',
    background: 'rgba(220, 38, 38, 0.95)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)'
  });

  badge.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    chrome.runtime.sendMessage({
      action: 'openSkipCutShortcut',
      url: link.href
    });
  });

  link.appendChild(badge);
  link.setAttribute(SKIPCUT_BADGE_ATTR, 'true');

  addNotInterestedBadge(link);
}

function addNotInterestedBadge(link) {
  if (!link || link.getAttribute('data-skipcut-ni-bound') === 'true') return;
  link.setAttribute('data-skipcut-ni-bound', 'true');   // mark first, synchronously

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = NI_BADGE_CLASS;
  btn.textContent = '不收';
  btn.title = '標為不收（同時觸發 YouTube 原生 ❌）';

  Object.assign(btn.style, {
    position: 'absolute',
    right: '76px',
    bottom: '8px',
    zIndex: '9999',
    padding: '4px 8px',
    border: 'none',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '700',
    color: '#fff',
    background: 'rgba(28, 36, 48, 0.92)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)'
  });

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const vid = videoIdOf(link.href);
    if (!vid) return;
    notInterestedStore((cur) => {
      const next = Object.assign({}, cur);
      const on = !next[vid];
      if (on) next[vid] = 1; else delete next[vid];
      chrome.storage.local.set({ [NI_KEY]: next });

      // in-place relabel + dim/undim, no rescan
      btn.textContent = on ? '已不收' : '不收';
      btn.style.color = on ? '#8b9bb0' : '#fff';
      const card = link.closest('ytd-compact-rich-item-renderer, ytd-rich-grid-item, rich-item, ytd-grid-video-renderer')
        || link.parentElement;
      if (card && card.style) card.style.opacity = on ? '.25' : '1';

      // real signal: POST the card's feedback token to YouTube's own endpoint
      if (on) {
        const scope = card || link.parentElement;
        const item = findDismissInfo(scope);
        let token = item && item.getAttribute ? item.getAttribute('data-feedback-token') : '';
        console.log('[skipcut] inline token:', token ? token.slice(0, 32) + '…' : null);
        if (token) {
          sendNotInterested(token, btn);
        } else {
          // Watch page: the ⋮ button lives in the player's control bar, which only
          // renders while the controls are showing. Hover the video to force it,
          // then open the card's ⋮ menu, wait for its items (with tokens) to mount.
          revealPlayerControls().then(() => {
            const menuBtn = findMenuButton(scope);
            if (menuBtn && typeof menuBtn.click === 'function') {
              menuBtn.click();
              waitForToken(4000).then((el) => {
                closeMenus();
                const t = el && el.getAttribute ? el.getAttribute('data-feedback-token') : '';
                console.log('[skipcut] menu token:', t ? t.slice(0, 32) + '…' : null);
                if (t) sendNotInterested(t, btn);
                else console.log('[skipcut] no feedback item found in menu');
              });
            } else {
              console.log('[skipcut] menu button not found');
            }
          });
        }
      }
    });
  });

  link.appendChild(btn);

  // reflect already-stored state once (single read, label only)
  notInterestedStore((cur) => {
    const vid = videoIdOf(link.href);
    if (vid && cur[vid]) {
      btn.textContent = '已不收';
      btn.style.color = '#8b9bb0';
      const card = link.closest('ytd-compact-rich-item-renderer, ytd-rich-grid-item, rich-item, ytd-grid-video-renderer')
        || link.parentElement;
      if (card && card.style) card.style.opacity = '.25';
    }
  });
}

function scanAndInjectShortcuts() {
  const host = window.location.hostname.replace(/^www\./, '');
  if (host !== 'youtube.com' && host !== 'm.youtube.com') return;

  const selectors = [
    'a#thumbnail[href*="/watch?v="]',
    'a#thumbnail[href*="/shorts/"]',
    'a.ytd-thumbnail[href*="/watch?v="]',
    'a.ytd-thumbnail[href*="/shorts/"]',
    'a.ytp-title-link[href*="/watch?v="]',
    'a[href*="/watch?v="][aria-label]',
    'a[href*="/shorts/"][aria-label]'
  ];

  document.querySelectorAll(selectors.join(',')).forEach(addSkipCutShortcut);
}

document.addEventListener('mousedown', (event) => {
  // Check for Ctrl key (Windows/Linux) or Command key (Mac), and left mouse button
  if ((event.ctrlKey || event.metaKey) && event.button === 0) {
    const targetElement = event.target.closest('a');

    // Check if the link is a valid YouTube video link
    if (targetElement && isYoutubeVideoLink(targetElement.href)) {
      // Stop the browser from following the link normally
      event.preventDefault();
      event.stopImmediatePropagation();

      chrome.runtime.sendMessage({ action: 'openSkipCut', url: targetElement.href });
    }
  }
}, true); // Use capture phase to catch the event early

scanAndInjectShortcuts();

const observer = new MutationObserver(() => {
  scanAndInjectShortcuts();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});
