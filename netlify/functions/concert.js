// /.netlify/functions/concert
//   POST  { name, songIds:[...] }              -> saves a concert, returns { id }
//   POST  { action:"rename", id, name }        -> renames a saved concert
//   GET   ?id=XXXX                             -> returns the concert + its songs
// Open (no auth), like suggestions. Concerts are stored as concerts/<id>.json in R2,
// and an index is kept light by storing each concert as its own object.
const { getJSON, putJSON, PREFIX, CATALOG_KEY, json } = require("./_r2");

const clip = (s, n) => String(s == null ? "" : s).slice(0, n).trim();
const cleanId = (s) => clip(s, 16).replace(/[^a-z0-9]/gi, "");
const newId = () =>
  Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);

exports.handler = async (event) => {
  // ---- LOAD ----
  if (event.httpMethod === "GET") {
    const id = cleanId((event.queryStringParameters || {}).id);
    if (!id) return json(400, { error: "Missing concert id" });
    try {
      const concert = await getJSON(`${PREFIX}concerts/${id}.json`, null);
      if (!concert) return json(404, { error: "Concert not found" });
      const catalog = await getJSON(CATALOG_KEY, { songs: [] });
      const byId = new Map((catalog.songs || []).map((s) => [s.id, s]));
      // Resolve song ids to full song objects, preserving the saved order,
      // and dropping any songs that have since been removed.
      const songs = (concert.songIds || []).map((sid) => byId.get(sid)).filter(Boolean);
      return json(200, { id, name: concert.name || "Untitled Concert", songs });
    } catch (err) {
      return json(500, { error: "Could not load concert", detail: String(err.message || err) });
    }
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Bad JSON" }); }

    // ---- RENAME ----
    if (body.action === "rename") {
      const id = cleanId(body.id);
      const name = clip(body.name, 80);
      if (!id) return json(400, { error: "Missing concert id" });
      if (!name) return json(400, { error: "The concert needs a name" });
      try {
        const concert = await getJSON(`${PREFIX}concerts/${id}.json`, null);
        if (!concert) return json(404, { error: "Concert not found" });
        concert.name = name;
        concert.renamedAt = new Date().toISOString();
        await putJSON(`${PREFIX}concerts/${id}.json`, concert);
        return json(200, { ok: true, id, name });
      } catch (err) {
        return json(500, { error: "Could not rename concert", detail: String(err.message || err) });
      }
    }

    // ---- SAVE ----
    const name = clip(body.name, 80) || "Untitled Concert";
    let songIds = Array.isArray(body.songIds) ? body.songIds : [];
    songIds = songIds.map((s) => clip(s, 80)).filter(Boolean).slice(0, 60);
    if (songIds.length === 0) return json(400, { error: "A concert needs at least one song" });

    const id = newId();
    const concert = { id, name, songIds, createdAt: new Date().toISOString() };
    try {
      await putJSON(`${PREFIX}concerts/${id}.json`, concert);
      return json(200, { ok: true, id, name });
    } catch (err) {
      return json(500, { error: "Could not save concert", detail: String(err.message || err) });
    }
  }

  return json(405, { error: "Method not allowed" });
};
