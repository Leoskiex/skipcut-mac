// content.js

const SKIPCUT_BADGE_CLASS = 'skipcut-shortcut-badge';
const SKIPCUT_BADGE_ATTR = 'data-skipcut-badge-bound';

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
