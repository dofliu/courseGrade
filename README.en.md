# EduGrade AI

[繁體中文](README.md) ｜ **English**

An AI-assisted grading system for university courses, integrating Google Gemini and Gmail. It supports course/weight management, AI batch grading (from folders and Gmail), offline caching, submission tracking, grade import/export, AI exam generation from your own lecture notes (with Word export), and lightweight classroom tools. The UI is in Traditional Chinese.

> Originally built on Google AI Studio, now refactored to run standalone: Firebase removed, Gmail authorization moved to Google Identity Services (GIS).

---

## Tech stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4
- **Backend**: Express (single `server.ts` serving the REST API with Vite middleware)
- **AI**: Google Gemini API (`gemini-3.5-flash`)
- **Auth**: Google Identity Services (OAuth, scoped to `gmail.readonly` + `userinfo.email`)
- **Document parsing**: `mammoth` (Word .docx → text), `xlsx` (roster/grade import), built-in .ipynb extraction
- **Document output**: `docx` (export exams as Word student/answer sheets)
- **Storage**: local `db.json` (courses & grades) + `gmail_cache/` (Gmail offline cache & attachments)
- **Tests**: Vitest (core logic extracted to `src/lib/`, 72 unit tests)

---

## Running locally

### 1. Install
```bash
npm install
```

### 2. Environment variables
Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose | Where to get it |
|----------|---------|-----------------|
| `GEMINI_API_KEY` | Server-side AI grading / exam generation (secret, never exposed to the browser) | https://aistudio.google.com/apikey |
| `VITE_GOOGLE_CLIENT_ID` | Gmail sign-in (public value) | Google Cloud Console (see below) |

> `server.ts` reads both `.env.local` and `.env`; `GEMINI_API_KEY` can also be a system environment variable.

### 3. Start
```bash
npm run dev      # http://localhost:3000
npm test         # run unit tests (Vitest)
npm run lint     # type-check (tsc --noEmit)
```

### One-click launch (no terminal)
After `npm install`, you can later just:
- **Double-click `Start-EduGrade.vbs`** → starts the server in the background and opens the browser when ready (no terminal window)
- or **double-click `EduGrade.bat`** → same, but keeps a small window for logs; closing it stops the server
- **`Stop-EduGrade.bat`** → stops the server (frees port 3000)
- CLI: `npm run launch`

> Only the Gmail intake feature needs `VITE_GOOGLE_CLIENT_ID`; everything else (folder batch, gradebook, submissions, dashboard, exam generation, classroom tools) needs only `GEMINI_API_KEY`.

### Gmail OAuth setup
1. Pick a project in the [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → enable **Gmail API**
3. OAuth consent screen → configure (add yourself as a test user during testing)
4. Credentials → Create OAuth client ID → type "Web application"
5. Add `http://localhost:3000` to "Authorized JavaScript origins"
6. Copy the Client ID into `VITE_GOOGLE_CLIENT_ID` in `.env.local`

---

## Features (eight tabs)

1. **Dashboard** — KPI cards (enrollment, class-average accumulated weighted score, main-item average, main-item submission rate) + grade distribution chart + a reminder-email text generator for missing submissions.
2. **Gradebook** — spreadsheet-style grade table (double-click any cell to edit a score, expand a row to edit feedback); grade import (paste "ID score feedback" or upload Excel/CSV); fill a whole column with the same score; per-student manual adjustment (±, with note); CSV export.
3. **Submissions overview** — a student × assessment matrix with four states (graded / submitted-pending / missing / unreleased) and per-column submission rates, plus "current accumulated weighted score" and "score needed on the final to pass".
4. **Classroom tools** — no-AI utilities: random picker, roll-call rotation, and seating chart.
5. **AI exam generation** — choose course, count, question types, and mode (strict: only from notes / extended); **upload your own lecture files (multiple)** in PDF/Word/Jupyter/image/txt so the AI generates questions from your material; edit/add/remove questions; print student/answer sheets; **export Word .docx** (real OOXML, editable in Word; answer sheet highlights the correct answers in red).
6. **AI folder batch** — pick a course + assessment, upload a whole folder (PDF/image/text/.docx/.ipynb); Gemini identifies each student and grades; skips already-graded students by default; falls back to the parent folder name (`ID_Name`) when the filename is uninformative.
7. **Gmail intake (offline workflow)** — "Read Gmail" downloads the whole batch of messages + attachments to disk once; review, grade, and reopen all work offline afterward. Includes label/folder selection, multi-signal student matching (sender email → ID → name), token-free offline grading, .docx/.ipynb text extraction, multi-attachment grading, auto-marking as submitted, and sync to the gradebook.
8. **Course & weight management** — course CRUD, assessments with weights, roster (manual/text/Excel import), and a per-assessment **AI rubric** sent to Gemini at grading time.

---

## Grade calculation

**Current accumulated weighted score** = the sum of `score × weight ÷ 100` over *graded* assessments only; ungraded/missing items count as 0 and the total is **not normalized**.

> e.g. HW1(70, 6%) + Midterm(30, 30%) + HW2(70, 6%) + Quiz(70, 8%) + Participation(80, 10%)
> = 4.2 + 9 + 4.2 + 5.6 + 8 = **31**

Once every assessment is graded and weights sum to 100%, this value is the final grade (can exceed 100 with bonus items).

**Score needed on the final to pass** = `(pass mark − weighted score earned outside the final) ÷ final weight`, rounded up.
> e.g. earned 31, pass mark 60, final at 40% → (60−31)/0.4 = 72.5 → **needs 73**.
> Shows "already safe" if passing, "final taken" if already graded, and "max not enough" if a perfect final still falls short.

---

## Backend API

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /api/db` | Read/save courses & grades (`db.json`) |
| `GET /api/version` | Version + server start time (shown in the footer) |
| `POST /api/analyze-file` | AI grade a single file (folder batch; rubric supported) |
| `POST /api/exam/generate` | AI exam generation from lecture files / topic scope |
| `POST /api/gmail/labels` | List Gmail labels (folders) |
| `POST /api/gmail/pull` | Scan Gmail and download the batch + attachments to disk; store a manifest |
| `GET/POST /api/gmail/cache` | Read/save the local cache manifest (token-free) |
| `POST /api/gmail/analyze-cached` | AI grade using local attachments (token-free; .docx/.ipynb text extraction) |
| `POST /api/gmail/scan`, `/api/gmail/analyze-attachment` | Legacy live endpoints (kept; the frontend now uses the offline flow) |

---

## Project layout

```
courseGrade/
├── server.ts              # Express backend (REST API + Vite middleware)
├── src/
│   ├── App.tsx            # Shell with the eight tabs
│   ├── components/        # Feature components (gradebook, submissions, exam, classroom…)
│   ├── lib/               # Pure logic + unit tests (grades/matching/parsing/notebook/exam/db/examDocx)
│   └── types.ts           # Shared types
├── scripts/launch.mjs     # One-click launcher
├── STATUS.yaml            # Project metadata (for the research dashboard)
└── db.json                # Local grade DB (gitignored, contains personal data)
```

---

## Storage & privacy

- `db.json` — courses, students, grades (personal data); gitignored.
- `gmail_cache/` — Gmail manifest + downloaded attachments; gitignored.
- `backups/` — automatic `db.json` backups; gitignored.
- `_sample_docx/` — exam .docx export samples; gitignored.
- `.env.local` — secrets; gitignored.

> All of the above live **only on your machine** — never committed to git, never uploaded to any external service.

### Grade-data safety
To avoid losing grades, `db.json` access is protected in several layers:
- **Atomic writes**: write `db.json.tmp` then rename, so a crash mid-write can't corrupt the file.
- **Automatic backups**: back up the previous version to `backups/` before each save (throttled to ≥3 min apart; keeps the latest 50).
- **Corruption guard**: if `db.json` fails to parse on read, the original is **never overwritten** — it restores from the latest valid backup.
- **Validation**: rejects structurally invalid writes or "blank courses overwriting existing ones".
- **Frontend alert**: a red banner on save failure, so you never think a save succeeded when it didn't.
- **Backend hardening**: global error handling so a single bad request can't crash the server.

---

## Known limits / roadmap

See [TODO.md](TODO.md).
