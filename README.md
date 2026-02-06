# Dialpad AI Power Dialer & Agent

An intelligent automation system for Dialpad that combines OCR contact extraction, smart phone number prioritization, and AI voice capabilities to streamline large-scale calling campaigns.

## 🚀 Key Features

*   **Intelligent OCR Extraction**: Uses **Gemini 2.0 Flash Lite** to extract contacts from CRM screenshots (Name, Email, Mobile, Phone).
*   **Government Line Filtering**: Automatically detects and flags broad organizational switchboards (e.g., ending in "00" or "000") to save time.
*   **Intelligent Power Dialer**:
    *   Prioritizes **Mobile** numbers over landlines.
    *   Automatic call failure detection (busy, declined, missed).
    *   Automatic advance to the next contact.
*   **Dual Mode Operation**:
    *   **Manual Mode (Bypass Vapi)**: Pure power dialer. The system dials and alerts you (visually and with sound) only when someone answers.
    *   **AI Agent Mode**: Integrated with **Vapi** to handle calls automatically (Assistant, Voicemail, or Human-bridge modes).
*   **Skip & Email Workflow**: A dedicated button to hang up and start a customizable countdown (default 20s), providing the contact's email for a quick manual follow-up before the next dial.
*   **Local Persistence**: Progress and settings are saved in `localStorage`, allowing you to resume campaigns after refreshing or closing the browser.

## 🛠️ Tech Stack

*   **Frontend**: Next.js 16 (App Router), Tailwind CSS, Lucide Icons.
*   **AI/OCR**: Google Generative AI (Gemini 2.0 Flash Lite).
*   **Voice AI**: Vapi SDK.
*   **Browser Integration**: Chrome Extension (Manifest v3) with MutationObservers for real-time Dialpad state tracking.

## 📋 Prerequisites

1.  **Node.js** (v18+)
2.  **Google Gemini API Key** (for OCR and filtering)
3.  **Vapi Public Key** (Optional - only for AI Agent mode)
4.  **Google Chrome**

## ⚙️ Setup Instructions

### 1. Web App Setup

1.  Navigate to `web-app`.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in `web-app`:
    ```env
    GEMINI_API_KEY=your_google_gemini_key
    NEXT_PUBLIC_VAPI_PUBLIC_KEY=your_vapi_public_key
    ```
4.  Start the server:
    ```bash
    npm run dev
    ```

### 2. Chrome Extension Setup

1.  Open Chrome and go to `chrome://extensions`.
2.  Enable **Developer mode**.
3.  Click **Load unpacked** and select the `extension` folder.
4.  **Copy the ID** of the newly installed extension.

## 📖 Usage Guide

1.  **Configure**: Paste your Extension ID into the Dashboard.
2.  **Load Contacts**: Upload a screenshot with 4 columns: *Name, Email, Mobile Phone, Phone Number*.
3.  **Choose Mode**:
    *   Toggle **Bypass Vapi** ON for manual calling with connection alerts.
    *   Toggle **Bypass Vapi** OFF if you want the AI to talk for you.
4.  **Start**: Click **Start Campaign**. The extension will focus Dialpad and begin dialing.
5.  **Interaction**:
    *   When a call connects, you'll hear a double-beep and see a red alert.
    *   Use **SKIP & EMAIL** to hang up and get 20 seconds to send a manual email before the system dials the next person.

## ⚠️ Notes

-   You must be logged into **Dialpad Web** (`dialpad.com`) for the extension to work.
-   The AI filtering for government lines is optimized for "00" and "000" patterns but can be refined in `process-screenshot.ts`.