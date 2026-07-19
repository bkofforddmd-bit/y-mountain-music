# Y-Mountain Music — setup guide

A sister app to Conference as a Concert, for your songs that *aren't* from
conference talks. Same engine: song library, Build a Concert, share links,
the 🚗 road-trip kit (lyric book, save-for-offline, MP3 zip), concert
renaming, Request-a-Song board, and the password-protected Band Upload tab.

What's different:

- Branded **Y-Mountain Music** everywhere (title, share messages, lyric-book
  covers, install-app name).
- Songs carry a flexible **"Inspired by"** line + optional link instead of
  "Source talk / Speaker" (the old speaker box is now **Artist / credit**,
  Session is now **Collection**).
- The Study Plan is now **📖 Behind the Songs**.
- Its songs live in their own corner of your existing Cloudflare storage
  (everything under a `ymm/` prefix), so the two apps share one bucket and
  one set of credentials **without ever mixing up their libraries**.

## One-time setup (about 15 minutes)

### 1. New GitHub repository

Make a new repo (e.g. `y-mountain-music`) and upload **everything in this
folder**, keeping the structure:

- repo root: `index.html`, `sw.js`, `manifest.json`, `netlify.toml`,
  `logo.png`, `icon.png`, `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`
- folder `netlify/functions/`: `_r2.js`, `data.js`, `upload.js`,
  `suggest.js`, `concert.js`, `gdoc.js`

### 2. New Netlify site

In Netlify: **Add new site → Import an existing project** → pick the new
repo. No build command needed (leave it blank; publish directory is the repo
root — the included `netlify.toml` handles it). Pick the site name you want,
e.g. `ymountainmusic` → the app lives at `https://ymountainmusic.netlify.app`.

### 3. Copy the environment variables

Open your **existing** conferenceconcert site in Netlify → Site configuration
→ Environment variables, and copy these six to the **new** site (same
values):

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE`
- `UPLOAD_PASSWORD`  ← you can also choose a different band password here

Then redeploy the new site (Deploys → Trigger deploy) so the variables take
effect.

### 4. Allow the new site in Cloudflare (one CORS line)

Uploads and the road-trip kit talk to Cloudflare storage directly, and
Cloudflare only answers origins it has been told about. In the Cloudflare
dashboard: **R2 → your bucket → Settings → CORS policy**, and add the new
site's address to `AllowedOrigins`, so the policy looks something like:

```json
[
  {
    "AllowedOrigins": [
      "https://conferenceconcert.netlify.app",
      "https://ymountainmusic.netlify.app"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"]
  }
]
```

(Keep whatever is already there and just add the new origin line. If you
chose a different Netlify site name, use that address.)

### 5. Try it

Open the new site → Band Upload → enter the band password → add your first
song. It appears in the library, and everything else (concerts, sharing,
lyric books, offline saves) works from there.

## Replacing the placeholder logo

`logo.png` (the big wordmark on the header) and the four icon files are
simple generated placeholders in your navy-and-gold theme. To use real
artwork, just replace the files — same names, roughly the same shapes
(logo: wide with transparent background; icons: square). Re-upload and
redeploy.

## Good to know

- The library starts **empty** — this app has its own catalog
  (`ymm/catalog.json` in the bucket), separate from the conference app's.
- Song requests go to the same band Gmail as the conference app.
- The Band Upload tab still accepts your song-studio project `.json` exports
  and Google-Doc lyric imports.
