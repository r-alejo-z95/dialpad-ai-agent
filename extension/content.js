// content.js (Dialpad Driver)

console.log("Dialpad AI Driver Loaded");

// Listen for commands from Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DIAL_NUMBER") {
    dialNumber(message.phone);
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
  
  const observer = new MutationObserver((mutations) => {
    // Check for indicators of an active call
    // Examples: A timer (00:01), a "Hangup" button becoming active, specific text "Connected"
    
    const bodyText = document.body.innerText;
    
    // Heuristics for "Active Call"
    // 1. Timer pattern: 00:00 or 0:00 (Check for a span containing time pattern that increments)
    // 2. "Connected" text
    // 3. "End Call" button presence vs "Call" button
    
    // Simplistic check: Look for a timer-like element that wasn't there or "Hang up" button
    const hangupBtn = document.querySelector('[aria-label="Hang up"], [aria-label="End call"]');
    const timer = document.body.innerText.match(/\b\d{1,2}:\d{2}\b/); // Matches 0:00, 12:34
    
    if (hangupBtn && timer) {
      console.log("Active call detected!");
      observer.disconnect(); // Stop watching once detected
      
      // Notify Background
      chrome.runtime.sendMessage({ type: "CALL_CONNECTED_DETECTED" });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  
  // Safety timeout: Stop observing after 60s if no connection
  setTimeout(() => {
    observer.disconnect();
  }, 60000);
}
