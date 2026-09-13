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
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }).then(() => {
    pill.textContent = '已移除';
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
        const item = findDismissInfo(card || link.parentElement);
        const token = item && item.getAttribute ? item.getAttribute('data-feedback-token') : '';
        if (token) sendNotInterested(token, btn);
        else {
          const native = deepFind(card || link.parentElement,
            (el) => el.id === 'dismiss-button' || /不感興趣|not interested/i.test(el.textContent || ''), 400);
          if (native && typeof native.click === 'function') native.click();
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
