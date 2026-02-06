// content.js (Dialpad Driver - Precise Call Detection)

console.log("[Dialpad AI] Precise Driver Loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DIAL_NUMBER") {
    dialNumber(message.phone);
  } else if (message.type === "HANGUP_CALL") {
    clickHangup();
  }
});

function clickHangup() {
  // Try to find the button containing the specific hang-up icon
  const hangupIcon = document.querySelector('.d-icon--phone-hang-up');
  if (hangupIcon) {
    const btn = hangupIcon.closest('button');
    if (btn) {
      console.log("[Dialpad AI] Hanging up via icon-button.");
      btn.click();
      return true;
    }
  }

  // Fallback selectors
  const fallbacks = ['[aria-label="Hang up"]', '[aria-label="End call"]', '[data-qa="call-hangup"]'];
  for (const sel of fallbacks) {
    const el = document.querySelector(sel);
    if (el) {
      el.click();
      return true;
    }
  }
  return false;
}

async function dialNumber(phone) {
  console.log("[Dialpad AI] Dialing:", phone);

  const findInput = () => {
    return document.querySelector('input[type="tel"]') || 
           document.querySelector('input[placeholder*="phone"]') ||
           document.querySelector('#search-input');
  };

  let input = findInput();

  if (!input) {
    const makeCallBtn = document.querySelector('[data-qa="header-cta-call"]');
    if (makeCallBtn) {
      makeCallBtn.click();
      await new Promise(r => setTimeout(r, 600));
      input = findInput();
    }
  }

  if (!input) {
    alert("Please open Dialpad dialer manually.");
    return;
  }

  input.focus();
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeInputValueSetter.call(input, phone);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  
  setTimeout(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    monitorCall();
  }, 300);
}

function monitorCall() {
  let connected = false;
  
  const checkInterval = setInterval(() => {
    // A call is active if the hang-up icon exists in the DOM
    const isCallActive = !!document.querySelector('.d-icon--phone-hang-up');

    // 1. Detect connection
    if (isCallActive && !connected) {
      connected = true;
      console.log("[Dialpad AI] State: ACTIVE");
      chrome.runtime.sendMessage({ type: "CALL_CONNECTED_DETECTED" });
    }

    // 2. Detect hangup
    if (connected && !isCallActive) {
      connected = false;
      console.log("[Dialpad AI] State: IDLE");
      chrome.runtime.sendMessage({ type: "CALL_DISCONNECTED" });
      clearInterval(checkInterval);
    }
  }, 1000);

  setTimeout(() => clearInterval(checkInterval), 7200000);
}
