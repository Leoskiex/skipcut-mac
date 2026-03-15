// background.js

const MENU_OPEN = 'openInSkipCut';
const MENU_KEEP_HISTORY = 'keepHistorySignal';
const HISTORY_TTL_SECONDS = 45;

function toSkipCutUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      parsed.hostname = 'skipcut.com';
      return parsed.toString();
    }

    if (host === 'youtu.be') {
      const videoId = parsed.pathname.replace('/', '');
      if (!videoId) return null;

      const skipCut = new URL('https://skipcut.com/watch');
      skipCut.searchParams.set('v', videoId);
      return skipCut.toString();
    }

    return null;
  } catch {
    return null;
  }
}

function createMenus(keepHistorySignal = false) {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_OPEN,
      title: 'Open in SkipCut',
      contexts: ['link'],
      targetUrlPatterns: ['*://*.youtube.com/*']
    });

    chrome.contextMenus.create({
      id: MENU_KEEP_HISTORY,
      title: 'Keep YouTube history signal (45s)',
      type: 'checkbox',
      checked: keepHistorySignal,
      contexts: ['link'],
      targetUrlPatterns: ['*://*.youtube.com/*']
    });
  });
}

function getKeepHistorySetting(callback) {
  chrome.storage.local.get({ keepHistorySignal: false }, ({ keepHistorySignal }) => {
    callback(Boolean(keepHistorySignal));
  });
}

function openInSkipCut(url) {
  const skipCutUrl = toSkipCutUrl(url);
  if (!skipCutUrl) return;

  chrome.tabs.create({ url: skipCutUrl });

  getKeepHistorySetting((keepHistorySignal) => {
    if (keepHistorySignal) {
      keepYoutubeHistorySignal(url);
    }
  });
}

function keepYoutubeHistorySignal(url) {
  chrome.tabs.create({ url, active: false }, (tab) => {
    if (!tab || typeof tab.id !== 'number') return;

    const alarmName = `close-youtube-tab-${tab.id}`;
    chrome.alarms.create(alarmName, { delayInMinutes: HISTORY_TTL_SECONDS / 60 });
    chrome.storage.local.set({ [alarmName]: tab.id });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  getKeepHistorySetting((keepHistorySignal) => {
    createMenus(keepHistorySignal);
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_OPEN && info.linkUrl) {
    openInSkipCut(info.linkUrl);
    return;
  }

  if (info.menuItemId === MENU_KEEP_HISTORY) {
    const checked = Boolean(info.checked);
    chrome.storage.local.set({ keepHistorySignal: checked }, () => {
      createMenus(checked);
    });
  }
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'openSkipCut' && request.url) {
    openInSkipCut(request.url);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith('close-youtube-tab-')) return;

  chrome.storage.local.get(alarm.name, (result) => {
    const tabId = result[alarm.name];
    if (typeof tabId !== 'number') return;

    chrome.tabs.remove(tabId, () => {
      // The tab may already be closed; ignore runtime errors.
      chrome.storage.local.remove(alarm.name);
    });
  });
});
