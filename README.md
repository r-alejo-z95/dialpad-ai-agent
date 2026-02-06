# Dialpad AI Agent

This project automates conference invitation calls using a Next.js Dashboard, Gemini Flash 2.0 Lite (OCR), and Vapi (Voice AI), controlled via a Chrome Extension.

## Prerequisites

1.  **Node.js** (v18+)
2.  **Google Gemini API Key** (for OCR)
3.  **Vapi Public Key** (for Voice Agent)
4.  **Google Chrome**

## Setup Instructions

### 1. Web App Setup

1.  Navigate to `web-app`.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in `web-app` with your keys:
    ```env
    GEMINI_API_KEY=your_google_gemini_key
    NEXT_PUBLIC_VAPI_PUBLIC_KEY=your_vapi_public_key
    ```
4.  Start the server:
    ```bash
    npm run dev
    ```
5.  Open [http://localhost:3000](http://localhost:3000).

### 2. Chrome Extension Setup

1.  Open Chrome and go to `chrome://extensions`.
2.  Enable **Developer mode** (top right).
3.  Click **Load unpacked**.
4.  Select the `extension` folder in this project.
5.  **Copy the ID** of the newly installed extension (e.g., `abcdef...`).

### 3. Usage

1.  On the Dashboard ([localhost:3000](http://localhost:3000)), paste the **Extension ID** into the configuration field.
2.  Upload a screenshot of a contact list (HubSpot style) to the Dropzone.
3.  Verify the extracted contacts in the table.
4.  Enter Conference details and any specific prompts for the AI.
5.  Click **Start Campaign**.
    *   The extension will open/focus Dialpad.
    *   It will dial the number.
    *   Once the call is answered, Vapi will start talking automatically.

## Notes

-   Ensure you are logged into **Dialpad Web** (`dialpad.com`) before starting.
-   The extension uses `gemini-2.0-flash-lite-preview-02-05` by default.
