# Dialpad AI Agent - Manual Control Panel

A streamlined system designed to bridge the gap between CRM screenshots and Dialpad calling workflows. Currently operating as a high-efficiency manual dashboard with integrated contact intelligence.

> **Note**: Full autonomous AI Agent capabilities (automated calling sequences) are planned for future releases.

## 🚀 Current Features

*   **Manual One-Click Dialing**: Dial any contact's mobile or office number directly from the dashboard with a single click.
*   **Intelligent HubSpot Integration**: Automatically opens a HubSpot search tab (`email||name||phone`) as soon as you initiate a call, ensuring you have the customer's history ready.
*   **OCR Contact Extraction**: Powered by **Gemini 2.0 Flash Lite**, instantly extract contact lists (Name, Email, Mobile, Office Phone) from HubSpot/CRM screenshots.
*   **Smart Contact Management**:
    *   **Accumulative Loading**: Upload multiple screenshots to build a single, persistent campaign list.
    *   **Direct DB Editing**: Modify names, numbers, or statuses directly from the UI table.
    *   **Auto-Status Tracking**: Contacts are automatically marked as `CALLED` in the database once a call is finished (manually or via Dialpad).
*   **Real-time Sync**: The Chrome Extension acts as a bridge, reporting real-time call connection and disconnection states back to the dashboard.
*   **Jump-to-Contact**: Set your progress point to any row in the table using the "Play" action.

## 🛠️ Tech Stack

*   **Dashboard**: Next.js 16 (App Router), Tailwind CSS, Lucide Icons.
*   **Database**: Prisma with PostgreSQL.
*   **AI/OCR**: Google Generative AI (Gemini 2.0 Flash Lite).
*   **Browser Integration**: custom Chrome Extension (Manifest v3) with real-time DOM monitoring.

## 📋 Prerequisites

1.  **Node.js** (v18+)
2.  **PostgreSQL** database.
3.  **Google Gemini API Key** (for contact extraction).
4.  **Google Chrome** with Dialpad Web logged in.

## ⚙️ Setup Instructions

### 1. Web App Setup

1.  Navigate to `web-app`.
2.  Install dependencies: `npm install`
3.  Configure `.env`:
    ```env
    DATABASE_URL="your_postgresql_url"
    GEMINI_API_KEY="your_google_gemini_key"
    NEXT_PUBLIC_VAPI_PUBLIC_KEY="" # For future use
    ```
4.  Initialize Database: `npx prisma db push`
5.  Start: `npm run dev`

### 2. Extension Setup

1.  Open `chrome://extensions`.
2.  Enable **Developer mode**.
3.  Click **Load unpacked** and select the `extension` folder.
4.  Copy the Extension ID and hardcode it in `web-app/app/page.tsx` (constant `EXTENSION_ID`).

## 📖 Usage Guide

1.  **Load**: Upload a CRM screenshot. The AI will populate the table.
2.  **Edit**: Use the pencil icon to fix any misread data or change statuses.
3.  **Dial**: Click the phone icon next to any number. HubSpot will open in a new tab immediately.
4.  **Finish**: Once you hang up in Dialpad or the dashboard, the contact status will turn to `CALLED` and the progress marker will stay on that row.

## 🔮 Roadmap (Future)

*   [ ] **Autonomous AI Agent**: Integration with Vapi for fully automated outbound calling.
*   [ ] **Power Dialer Mode**: Optional automatic advancement to the next `PENDING` contact after a notes period.
*   [ ] **Advanced Filtering**: More granular control over contact prioritization.
