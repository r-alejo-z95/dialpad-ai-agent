// bridge.js (Inject into localhost:3000)

console.log("Dialpad AI Bridge Loaded on Dashboard");

// Listen for messages from Background (Extension)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Bridge received message from Extension:", message.type, message.payload);
  
  if (message.type === "ACTIVATE_VAPI") {
    window.postMessage({
      type: "DIALPAD_CALL_CONNECTED",
      payload: message.payload
    }, "*");
  } else if (message.type === "DIALPAD_CALL_FAILED") {
    window.postMessage({
      type: "DIALPAD_CALL_FAILED",
      payload: message.payload
    }, "*");
  } else if (message.type === "DIALPAD_CALL_DISCONNECTED") {
    window.postMessage({
      type: "DIALPAD_CALL_DISCONNECTED",
      payload: message.payload
    }, "*");
  }
});
