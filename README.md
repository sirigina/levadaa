# Le Vada

A satirical somatic-assessment web app. Upload a photo → the Institute's analysts scan it against eight dubious doctrines → receive a 1920s-style certificate you can share as an image. Runs entirely in the browser — no server, no login, no data leaves the device.

**This is a joke.** None of the "doctrines" predict anything. Please only scan photos of willing participants.

## Features

- 100% client-side after load — even the image hashing, "analysis", and share-image generation run in the browser.
- Deterministic scoring: the same photo always produces the same score (SHA-256 hash seeds the PRNG).
- Full-viewport scan screen — photo + terminal readout both stay visible on mobile, no page scroll during analysis.
- Share as PNG via the native mobile share sheet (works with SMS / iMessage / WhatsApp / etc.).
- Archive of past assessments stored in `localStorage`.

## Running locally

```bash
npm install
npm run dev
```

Then open the URL printed in your terminal on your phone (same Wi-Fi) or desktop.

## Deploying to Vercel

### Option A — GitHub (recommended)

1. Push this folder to a GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new), import the repo, click **Deploy**.
3. Vercel auto-detects Vite and builds it. You'll get a `*.vercel.app` URL in ~30 seconds.

### Option B — CLI

```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```

No environment variables or secrets are needed.

## Tech

- **Vite + React 18** — tiny bundle, fast
- **html-to-image** — turns the certificate `<div>` into a PNG `Blob`
- **Web Share API Level 2** (`navigator.share({ files })`) — triggers the OS share sheet with the PNG attached
- **localStorage** — stores up to 12 past assessments with 160×160 thumbnails

## File layout

```
src/
  main.jsx        entry
  App.jsx         all screens + share logic
  theories.js     the eight "doctrines" + classifications
  styles.css      the whole visual language
```

## Customizing

- **Add/remove doctrines**: edit the `THEORIES` array in `src/theories.js`.
- **Rename the institute**: edit strings in `src/App.jsx` and `index.html`.
- **Change the aesthetic**: edit the CSS custom properties at the top of `src/styles.css`.
