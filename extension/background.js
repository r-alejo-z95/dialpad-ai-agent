// background.js

// Store the Tab ID of the Dashboard (Next.js app) to send messages back
let dashboardTabId = null;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === "START_CAMPAIGN_CALL") {
    console.log("Received START_CAMPAIGN_CALL", message);
    
    // Save the sender tab as the dashboard tab
    if (sender.tab) {
      dashboardTabId = sender.tab.id;
    }

    const { phone, conferenceInfo, dynamicPrompt } = message.payload;

    // Store data for the content script to pick up
    chrome.storage.local.set({
      currentCall: {
        phone,
        conferenceInfo,
        dynamicPrompt,
        status: "pending"
      }
    }, () => {
      // Find or Open Dialpad
      chrome.tabs.query({ url: "https://dialpad.com/*" }, (tabs) => {
        if (tabs.length > 0) {
          const tab = tabs[0];
          chrome.tabs.update(tab.id, { active: true }, () => {
            // Send message to content script to dial
            // We give it a slight delay to ensure tab is ready if it was reloading or just focused
            setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { type: "DIAL_NUMBER", phone });
            }, 1000);
          });
        } else {
          chrome.tabs.create({ url: "https://dialpad.com/app" }, (tab) => {
            // Wait for load? The content script will handle 'ready' state or we retry?
            // Ideally, content script announces it's ready. 
            // For now, we'll let the user/logic flow handle it, or we rely on content script reading storage?
            // Simplest: The content script listens for "DIAL_NUMBER".
            // We can retry sending if the tab is new.
            
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
              if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.sendMessage(tabId, { type: "DIAL_NUMBER", phone });
                chrome.tabs.onUpdated.removeListener(listener);
              }
            });
          });
        }
      });
    });

    sendResponse({ success: true });
  }
});

// Listen for messages from Dialpad Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CALL_CONNECTED_DETECTED") {
    console.log("Call connected detected via Content Script");
    notifyDashboard("ACTIVATE_VAPI", true);
  } else if (message.type === "CALL_FAILED") {
    console.warn("Call failed:", message.reason);
    notifyDashboard("DIALPAD_CALL_FAILED", { reason: message.reason });
  } else if (message.type === "CALL_DISCONNECTED") {
    console.log("Call disconnected");
    notifyDashboard("DIALPAD_CALL_DISCONNECTED", {});
  }
});

function notifyDashboard(type, includeContext = false) {
  const send = (tabId, payload) => {
    chrome.tabs.sendMessage(tabId, { type, payload });
  };

  const getPayloadAndSend = (tabId) => {
    if (includeContext) {
      chrome.storage.local.get(["currentCall"], (result) => {
        const { conferenceInfo, dynamicPrompt } = result.currentCall || {};
        send(tabId, { conferenceInfo, dynamicPrompt });
      });
    } else {
      send(tabId, typeof includeContext === 'object' ? includeContext : {});
    }
  };

  if (dashboardTabId) {
    getPayloadAndSend(dashboardTabId);
  } else {
    chrome.tabs.query({ url: "http://localhost:3000/*" }, (tabs) => {
      if (tabs.length > 0) getPayloadAndSend(tabs[0].id);
    });
  }
}
