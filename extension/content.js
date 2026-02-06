// content.js (Dialpad Driver)

console.log("Dialpad AI Driver Loaded");

// Listen for commands from Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DIAL_NUMBER") {
    dialNumber(message.phone);
  } else if (message.type === "HANGUP_CALL") {
    const hangupBtn = document.querySelector('[aria-label="Hang up"], [aria-label="End call"]');
    if (hangupBtn) hangupBtn.click();
  }
});

async function dialNumber(phone) {
  console.log("Attempting to dial:", phone);

  // 1. Locate Input
  // Selectors based on generic Dialpad implementation or provided hints
  const selectors = [
    'input[type="tel"]',
    'input[placeholder*="phone"]',
    'input[aria-label*="phone"]',
    '#search-input', // Common in some apps
    '[data-testid="search-input"]'
  ];

  let input = null;
  for (const sel of selectors) {
    input = document.querySelector(sel);
    if (input) break;
  }

  if (!input) {
    console.error("Dialpad input not found.");
    alert("Dialpad AI: Could not find phone input field.");
    return;
  }

  // 2. Clear and Type
  input.focus();
  input.value = "";
  
  // Simulate typing (sometimes required by React/Frameworks)
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeInputValueSetter.call(input, phone);
  
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // 3. Press Enter
  setTimeout(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    
    // Also try finding a "Call" button if Enter doesn't work
    // const callBtn = document.querySelector('[aria-label="Call"], button svg[data-icon="phone"]');
    // if(callBtn) callBtn.click();
    
    console.log("Dialed number and pressed Enter.");
    
    // Start monitoring for connection
    monitorCallStatus();
  }, 500);
}

function monitorCallStatus() {
  console.log("Monitoring call status...");
  
  let connectionDetected = false;

  const observer = new MutationObserver((mutations) => {
    const hangupBtn = document.querySelector('[aria-label="Hang up"], [aria-label="End call"]');
    const timer = document.body.innerText.match(/\b\d{1,2}:\d{2}\b/);
    
    // Check if we are still on a call screen or if it returned to dialer
    const dialBtn = document.querySelector('[aria-label="Call"], button svg[data-icon="phone"]');

    if (hangupBtn && timer && !connectionDetected) {
      console.log("Active call detected!");
      connectionDetected = true;
      chrome.runtime.sendMessage({ type: "CALL_CONNECTED_DETECTED" });
    }

    // If we had a connection and now the hangup button is gone, the call ended
    if (connectionDetected && !hangupBtn) {
      console.log("Call ended.");
      observer.disconnect();
      chrome.runtime.sendMessage({ type: "CALL_DISCONNECTED" });
    }

    // If we never detected a connection and we are back at the dialer, it failed
    if (!connectionDetected && dialBtn && !hangupBtn) {
       // Check if there's some error text like "Busy" or "No answer"
       const bodyText = document.body.innerText;
       if (bodyText.includes("Busy") || bodyText.includes("Declined") || bodyText.includes("Missed")) {
          console.log("Call failed detected.");
          observer.disconnect();
          chrome.runtime.sendMessage({ type: "CALL_FAILED", reason: "Line busy or declined" });
       }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  
  // Safety timeout: Stop observing after 60s if no connection
  setTimeout(() => {
    if (!connectionDetected) {
      console.log("Monitor timeout - no connection detected.");
      observer.disconnect();
      chrome.runtime.sendMessage({ type: "CALL_FAILED", reason: "Timeout" });
    }
  }, 60000);
}
