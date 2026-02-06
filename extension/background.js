// background.js

let dashboardTabId = null;

// Listen from Dashboard (External)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log("[Background] External message:", message.type);
  
  if (message.type === "START_CAMPAIGN_CALL") {
    if (sender.tab) dashboardTabId = sender.tab.id;
    chrome.storage.local.set({ currentCall: message.payload });

    chrome.tabs.query({ url: "https://dialpad.com/*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "DIAL_NUMBER", phone: message.payload.phone });
      } else {
        console.warn("Dialpad tab not found");
      }
    });
    sendResponse({ success: true });
  } 
  
  else if (message.type === "HANGUP_CALL") {
    chrome.tabs.query({ url: "https://dialpad.com/*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "HANGUP_CALL" });
      }
    });
    sendResponse({ success: true });
  }
});

// Listen from Content Scripts (Internal)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Internal message:", message.type);

  if (message.type === "CALL_CONNECTED_DETECTED") {
    notifyDashboard("DIALPAD_CALL_CONNECTED", true);
  } 
  else if (message.type === "CALL_DISCONNECTED") {
    notifyDashboard("DIALPAD_CALL_DISCONNECTED", false);
  }
});

function notifyDashboard(type, includeContext = false) {
  const getPayloadAndSend = (tabId) => {
    if (includeContext) {
      chrome.storage.local.get(["currentCall"], (result) => {
        chrome.tabs.sendMessage(tabId, { type, payload: result.currentCall || {} });
      });
    } else {
      chrome.tabs.sendMessage(tabId, { type, payload: {} });
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