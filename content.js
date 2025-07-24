// content.js

document.addEventListener('mousedown', (event) => {
  // Check for Ctrl key (Windows/Linux) or Command key (Mac), and left mouse button
  if ((event.ctrlKey || event.metaKey) && event.button === 0) {
    const targetElement = event.target.closest('a');

    // Check if the link is a valid YouTube video link
    if (targetElement && targetElement.href && targetElement.href.includes('/watch?v=')) {
      console.log('Ctrl/Cmd + Left Click on YouTube link detected!', targetElement.href);
      
      // Stop the browser from following the link normally
      event.preventDefault();
      event.stopImmediatePropagation();
      
      chrome.runtime.sendMessage({ action: 'openSkipCut', url: targetElement.href });
    }
  }
}, true); // Use capture phase to catch the event early