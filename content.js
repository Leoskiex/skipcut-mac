// content.js

function isYoutubeVideoLink(rawUrl) {
  if (!rawUrl) return false;

  try {
    const parsed = new URL(rawUrl);
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
