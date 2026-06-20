# Redline

Editorial intelligence platform for manuscript review -- this build is the
reader-facing MVP: read the manuscript, leave a comment, everyone on the
link sees the same shared comment list. You export it as a batch whenever
you want.

## What's here

- `app/page.js` -- home page, renders the main app
- `components/RedlineApp.jsx` -- the reader app (manuscript reader, chapter
  navigation, comment form, shared comment list, CSV export)
- `app/api/comments/route.js` -- server route that reads/writes the shared
  comment list to a connected KV store
- `public/data/manuscript.json` -- the A26 draft, pre-parsed into chapters
  and paragraph-level passages. Loaded automatically on app start.

## What a reader can do

- Read the manuscript chapter by chapter, with Previous/Next navigation
- Click any passage to leave a comment (text, type, priority, their name)
- See every comment anyone has left, newest first, in the right rail --
  the app polls for new comments every 15 seconds
- Export the full comment list as a CSV at any time

There's still no separate admin role in the app. Export is just a read +
download, so there's no real harm in every reader having access to it.

## Required setup: connect a KV store

Comments need somewhere to live outside any one reader's browser. This app
expects a Redis-compatible KV store, reached via Upstash through Vercel's
Marketplace (Vercel's own KV product was sunset; Upstash is its
recommended replacement and stays inside the Vercel dashboard).

**On Vercel, after importing the repo:**

1. Open your project, go to the **Storage** tab.
2. Click **Connect Database** (or **Browse Marketplace**) and choose
   **Upstash** (Redis / KV).
3. Create a new store and connect it to this project.
4. Vercel automatically adds the needed environment variables
   (`KV_REST_API_URL` and `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL`
   / `UPSTASH_REDIS_REST_TOKEN` -- the app checks for either naming) --
   no manual copying needed.
5. Redeploy (or it may redeploy automatically once the integration is
   added).

**Until this is connected:** the app still works for reading the
manuscript, but comments will not save. Both the comment form and the
comment list show a clear message saying storage isn't connected yet,
rather than failing silently or crashing.

## Local development

```bash
npm install
npm run dev
```

To test comment saving locally, create `.env.local` with your Upstash
credentials (copy them from the Vercel Storage tab, or from your own
Upstash console if you created the store directly there):

```
KV_REST_API_URL=https://your-store.upstash.io
KV_REST_API_TOKEN=your-token
```

Without this file, the app still runs -- reading works, comments just
won't persist, matching the deployed behavior before storage is connected.

## What's NOT here (by design)

- **No author tooling in this app.** The Propagation Engine (matching),
  comment triage, and theme clustering from earlier prototypes were
  intentionally removed. They have no home here until there's a real
  author-only surface, separate from this reader link, to put them
  behind.
- **No multi-draft routing.** One manuscript, one URL. A different reader
  group needing a different draft means a separate deploy for now.
- **No real reader authentication.** The name field is self-reported and
  unverified. Anyone with the link can comment as anyone, and anyone can
  export. This matches the original PRD's "no account required" reader
  model, scaled down further by not separating author/reader access at
  all yet.
- **No comment editing or deletion** once submitted, by anyone, in-app.
  If something needs to be removed, that's a direct edit against the KV
  store for now (e.g. via the Upstash console), not an app feature.

## Manuscript data format

```json
{
  "chapters": ["Prologue", "Elena", "Jack", ...],
  "passages": [
    { "id": "p1", "chapter": "Prologue", "text": "..." },
    ...
  ]
}
```


