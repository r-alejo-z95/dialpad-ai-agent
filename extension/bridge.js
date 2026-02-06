// bridge.js (Inject into localhost:3000)

console.log("Dialpad AI Bridge Loaded on Dashboard");

// Listen for messages from Background (Extension)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ACTIVATE_VAPI") {
    console.log("Bridge received ACTIVATE_VAPI", message.payload);
    
    // Post message to the window so the React App can hear it
    window.postMessage({
      type: "DIALPAD_CALL_CONNECTED",
      payload: message.payload
    }, "*");
  }
});
