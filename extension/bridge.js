// bridge.js (Handover direct to Dashboard)

chrome.runtime.onMessage.addListener((message) => {
  // Simply forward any DIALPAD_ event to the window
  if (message.type && message.type.startsWith("DIALPAD_")) {
    console.log("[Bridge] Forwarding to Dashboard:", message.type);
    window.postMessage(message, "*");
  }
});