// POST /.netlify/functions/upload
// Headers: x-upload-password
// Two actions (no large file ever passes through this function):
//   { action: "sign", filename, contentType }  -> { uploadUrl, publicUrl }
//   { action: "save", song:{...} }             -> appends the song to catalog.json
// Back-compat: a body with { song } and no action is treated as "save".
const { getJSON, putJSON, presignPut, PREFIX, CATALOG_KEY, json } = require("./_r2");

const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD;
const clip = (s, n) => String(s == null ? "" : s).slice(0, n).trim();
const slug = (s) => clip(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "song";

// Validate a lyric-sync map: an array of [lineIndex, seconds] pairs marking when
// each lyric line starts in the audio. Returns a cleaned, time-sorted array, or
// null when there's nothing usable (which clears the sync).
const cleanSync = (raw, lyrics) => {
  if (!Array.isArray(raw)) return null;
  const lineCount = String(lyrics || "").replace(/\r/g, "").split("\n").length;
  const seen = new Set();
  const out = [];
  for (const p of raw.slice(0, 500)) {
    if (!Array.isArray(p)) continue;
    const i = parseInt(p[0], 10), t = Number(p[1]);
    if (!Number.isInteger(i) || i < 0 || i >= lineCount) continue;
    if (!isFinite(t) || t < 0 || t > 7200) continue;
    if (seen.has(i)) continue;
    seen.add(i);
    out.push([i, Math.round(t * 10) / 10]);
  }
  out.sort((a, b) => a[1] - b[1]);
  return out.length >= 2 ? out : null;
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const pw = event.headers["x-upload-password"] || event.headers["X-Upload-Password"];
  if (!UPLOAD_PASSWORD || pw !== UPLOAD_PASSWORD) return json(401, { error: "Wrong or missing password" });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Bad JSON" }); }

  const action = body.action || (body.song ? "save" : "");

  // ---- 0) Verify the password (used to enter band mode without uploading) ----
  // Reaching here means the password check above already passed.
  if (action === "verify") {
    return json(200, { ok: true });
  }

  // ---- 1) Hand out a presigned URL so the browser uploads straight to R2 ----
  if (action === "sign") {
    const ct = clip(body.contentType, 80) || "audio/mpeg";
    if (!/^audio\//.test(ct)) return json(400, { error: "Only audio files are allowed" });
    const ext = (clip(body.filename, 120).match(/\.[a-z0-9]+$/i) || [".mp3"])[0].toLowerCase();
    const base = slug(body.titleHint || body.filename || "song");
    const key = `${PREFIX}audio/${base}-${Date.now().toString(36)}${ext}`;
    try {
      const { uploadUrl, publicUrl } = await presignPut(key, ct);
      return json(200, { ok: true, uploadUrl, publicUrl });
    } catch (err) {
      return json(500, { error: "Could not create upload URL", detail: String(err.message || err) });
    }
  }

  // ---- 2) Save the song into the catalog ----
  if (action === "save") {
    const song = body.song || {};
    const title = clip(song.title, 160);
    if (!title) return json(400, { error: "Song title is required" });

    const entry = {
      id: slug(title) + "-" + Date.now().toString(36),
      title,
      talk:    clip(song.talk, 200),
      speaker: clip(song.speaker, 120),
      session: clip(song.session, 80),
      theme:   clip(song.theme, 80),
      group:   clip(song.group, 80),
      style:   clip(song.style, 120),
      talkUrl: clip(song.talkUrl, 500),
      youtube: clip(song.youtube, 200),
      audioUrl: clip(song.audioUrl, 500),
      previewStart: Math.max(0, Math.min(3600, parseInt(song.previewStart, 10) || 0)),
      duration: Math.max(0, Math.min(3600, parseInt(song.duration, 10) || 0)),
      lyrics:  clip(song.lyrics, 8000),
      lyricsDelay: (song.lyricsDelay===""||song.lyricsDelay==null)?35:Math.max(0,Math.min(120,parseInt(song.lyricsDelay,10)||0)),
      lyricsEnd: (song.lyricsEnd===""||song.lyricsEnd==null)?20:Math.max(0,Math.min(120,parseInt(song.lyricsEnd,10)||0)),
      blurb:   clip(song.blurb, 400),
      addedAt: new Date().toISOString(),
    };

    try {
      const catalog = await getJSON(CATALOG_KEY, { songs: [] });
      catalog.songs = catalog.songs || [];
      catalog.songs.unshift(entry);
      await putJSON(CATALOG_KEY, catalog);
      return json(200, { ok: true, entry });
    } catch (err) {
      return json(500, { error: "Could not update catalog", detail: String(err.message || err) });
    }
  }

  // ---- 3) Update an existing song in the catalog ----
  if (action === "update") {
    const song = body.song || {};
    const id = clip(song.id, 120);
    if (!id) return json(400, { error: "Missing song id" });
    try {
      const catalog = await getJSON(CATALOG_KEY, { songs: [] });
      const songs = catalog.songs || [];
      const i = songs.findIndex((x) => x.id === id);
      if (i < 0) return json(404, { error: "Song not found" });
      const cur = songs[i];
      songs[i] = {
        ...cur,
        title:   clip(song.title, 160) || cur.title,
        talk:    clip(song.talk, 200),
        speaker: clip(song.speaker, 120),
        session: clip(song.session, 80),
        theme:   clip(song.theme, 80),
        group:   clip(song.group, 80),
        style:   clip(song.style, 120),
        talkUrl: clip(song.talkUrl, 500),
        youtube: clip(song.youtube, 200),
        audioUrl: clip(song.audioUrl, 500) || cur.audioUrl,
        previewStart: Math.max(0, Math.min(3600, parseInt(song.previewStart, 10) || 0)),
        duration: Math.max(0, Math.min(3600, parseInt(song.duration, 10) || 0)),
        lyrics:  clip(song.lyrics, 8000),
      lyricsDelay: (song.lyricsDelay===""||song.lyricsDelay==null)?35:Math.max(0,Math.min(120,parseInt(song.lyricsDelay,10)||0)),
      lyricsEnd: (song.lyricsEnd===""||song.lyricsEnd==null)?20:Math.max(0,Math.min(120,parseInt(song.lyricsEnd,10)||0)),
        blurb:   clip(song.blurb, 400),
        updatedAt: new Date().toISOString(),
      };
      // Lyric edits can shift line numbers; drop sync marks that no longer land
      // on a real line so playback falls back to plain scrolling, not nonsense.
      if (songs[i].lyricsSync) {
        const revalidated = cleanSync(songs[i].lyricsSync, songs[i].lyrics);
        if (revalidated) songs[i].lyricsSync = revalidated;
        else delete songs[i].lyricsSync;
      }
      catalog.songs = songs;
      await putJSON(CATALOG_KEY, catalog);
      return json(200, { ok: true, entry: songs[i] });
    } catch (err) {
      return json(500, { error: "Could not update song", detail: String(err.message || err) });
    }
  }

  // ---- 3b) Save (or clear) a song's lyric-sync timestamps ----
  if (action === "sync") {
    const id = clip(body.id, 120);
    if (!id) return json(400, { error: "Missing song id" });
    try {
      const catalog = await getJSON(CATALOG_KEY, { songs: [] });
      const songs = catalog.songs || [];
      const i = songs.findIndex((x) => x.id === id);
      if (i < 0) return json(404, { error: "Song not found" });
      const sync = cleanSync(body.lyricsSync, songs[i].lyrics);
      if (sync) songs[i].lyricsSync = sync;
      else delete songs[i].lyricsSync;
      songs[i].updatedAt = new Date().toISOString();
      catalog.songs = songs;
      await putJSON(CATALOG_KEY, catalog);
      return json(200, { ok: true, entry: songs[i] });
    } catch (err) {
      return json(500, { error: "Could not save the sync", detail: String(err.message || err) });
    }
  }

  // ---- 3c) Set (or clear) a song's group — the library's organize mode ----
  // Touches ONLY the group field, so a quick filing tap can never wipe the
  // song's other details the way a partial "update" would.
  if (action === "group") {
    const id = clip(body.id, 120);
    if (!id) return json(400, { error: "Missing song id" });
    try {
      const catalog = await getJSON(CATALOG_KEY, { songs: [] });
      const songs = catalog.songs || [];
      const i = songs.findIndex((x) => x.id === id);
      if (i < 0) return json(404, { error: "Song not found" });
      songs[i].group = clip(body.group, 80);
      songs[i].updatedAt = new Date().toISOString();
      catalog.songs = songs;
      await putJSON(CATALOG_KEY, catalog);
      return json(200, { ok: true, entry: songs[i] });
    } catch (err) {
      return json(500, { error: "Could not save the group", detail: String(err.message || err) });
    }
  }

  // ---- 4) Delete a song from the catalog ----
  if (action === "delete") {
    const id = clip(body.id, 120);
    if (!id) return json(400, { error: "Missing song id" });
    try {
      const catalog = await getJSON(CATALOG_KEY, { songs: [] });
      catalog.songs = (catalog.songs || []).filter((x) => x.id !== id);
      await putJSON(CATALOG_KEY, catalog);
      return json(200, { ok: true });
    } catch (err) {
      return json(500, { error: "Could not delete song", detail: String(err.message || err) });
    }
  }

  return json(400, { error: "Unknown action" });
};
