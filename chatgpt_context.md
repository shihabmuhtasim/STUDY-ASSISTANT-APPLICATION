# NoteMyDoc AI - Project Context & Setup

This document provides a comprehensive overview of the current architecture, environment setup, and recent major changes for **NoteMyDoc AI**. It is designed to get ChatGPT Codex or any other AI assistant up to speed immediately.

## 1. Tech Stack & Architecture
- **Framework:** React 19 using `vinext` (a custom SSR framework) and Vite.
- **Styling:** Tailwind CSS v4 (via PostCSS).
- **Authentication:** Firebase Auth (Google Sign-In). **Note:** Firestore is *no longer used* for user data.
- **Database:** Cloudflare D1 SQL Database using **Drizzle ORM**.
- **AI Models:** Cloudflare Workers AI (`env.AI`) and Custom API connections.
- **Hosting:** Cloudflare Pages (`notemydocai.pages.dev`).

## 2. Environment & Configuration
- **Cloudflare Pages Binding:** 
  - Database: `DB` (Mapped to `notemydocai-production`)
  - AI: `AI`
- **Admin & Premium Access:** 
  - Access control and plan upgrades are managed by an `ADMIN_EMAILS` secret deployed directly to Cloudflare Pages (not in `wrangler.jsonc` to avoid binding collisions). 
  - Current Admins: `notemydocai@gmail.com, shihabmuhtasim.cs@gmail.com`.
  - When a user logs in, the backend (`server/accounts.ts`) checks this secret and automatically provisions them with a `pro` plan and `admin` role in the D1 database.
- **Deployment:** 
  - Direct deploy script: `npm run deploy:pages` (runs build, prepare, and `wrangler pages deploy`).
  - *Do not* declare `ADMIN_EMAILS` in `wrangler.jsonc` `vars`, as it conflicts with the Cloudflare Secret.

## 3. Core Features & Recent Code Modifications

### A. Dynamic PDF Export (`src/utils/pdfExport.ts`)
- PDF exports do not distort or squish slides; they maintain 100% native dimensions.
- Notes pages have dynamic vertical lengths based on content: 
  - Maximum height: 100% of an A4 page (297mm).
  - Minimum height: 20% of an A4 page (~60mm).
  - The page is cut exactly 1 inch (25.4mm) below the last line of text to eliminate empty whitespace.
- Uses `react-pdf`'s bundled `pdfjs` instead of a dynamic import to avoid module resolution errors in production.

### B. State Isolation & Data Sanitization (`src/App.tsx`, `src/components/StudyInterface.tsx`)
- The `<StudyInterface>` component uses `key={currentDocument.id}` in `App.tsx`. This enforces a hard unmount/remount when switching PDFs, completely wiping lingering React state and pending timeouts.
- Legacy or corrupted notes stored in IndexedDB (from prior bugs where notes bled across PDFs) are actively filtered out on load in `StudyInterface.tsx` by explicitly checking that `note.documentId === document.id`.

### C. Voice Notes Segregation (`src/components/NotesPanel.tsx`)
- Voice notes are heavily structured using an "Elite Academic Tutor" prompt (Cornell-style, bullet points).
- Mathematical outputs enforce strict unicode (e.g., `≈`, `×`, `→`) instead of LaTeX (`$` or `$$`) to prevent rendering artifacts.
- In the UI, the `NotesPanel` features a segmented toggle button at the top: **[Manual / AI]** vs **[Voice]**. This isolates voice dictation notes from standard manual notes, allowing drag-and-drop and edits without interference.
- Background transcription jobs are instantly flushed when the PDF changes to prevent rogue notes generating on the wrong document.

## 4. Common Commands
- **Local Dev Server:** `npm run dev`
- **Build App:** `npm run build`
- **Generate Drizzle Schema:** `npm run db:generate`
- **Type Checking:** `npm run lint` (`tsc --noEmit`)
- **Run Tests:** `npm run test`

## 5. Working Directory
`/Users/shihab/Documents/CODING/STUDY APP/STUDY-ASSISTANT-APPLICATION`
