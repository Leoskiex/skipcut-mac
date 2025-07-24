// background.js

function openInSkipCut(url) {
  if (url && url.includes("youtube.com")) {
    const skipCutUrl = url.replace("www.youtube.com", "skipcut.com").replace("m.youtube.com", "skipcut.com");
    console.log("Opening SkipCut URL:", skipCutUrl);
    chrome.tabs.create({ url: skipCutUrl });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "openInSkipCut",
    title: "Open in SkipCut",
    contexts: ["link"],
    targetUrlPatterns: ["*://*.youtube.com/*"]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "openInSkipCut" && info.linkUrl) {
    openInSkipCut(info.linkUrl);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openSkipCut" && request.url) {
    openInSkipCut(request.url);
  }
});