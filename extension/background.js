// background.js

// Store the Tab ID of the Dashboard (Next.js app) to send messages back
let dashboardTabId = null;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === "START_CAMPAIGN_CALL") {
    // ... existing logic ...
    sendResponse({ success: true });
  } else if (message.type === "HANGUP_CALL") {
    chrome.tabs.query({ url: "https://dialpad.com/*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "HANGUP_CALL" });
      }
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
