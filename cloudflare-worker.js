const OWNER = "mohamed20034";
const REPO = "mohsenplayer";
const BRANCH = "main";
const ALLOWED_ORIGIN = "https://mohamed20034.github.io";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".opus", ".webm"]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Upload-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
function secureEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function cleanName(value) {
  return String(value || "track").normalize("NFC")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "").slice(0, 100) || "track";
}
function decodeBase64Text(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeTextBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(binary);
}
function contentUrl(path, query = "") {
  const base = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/" +
    path.split("/").map(encodeURIComponent).join("/");
  return query ? base + "?" + query : base;
}
async function github(path, token, options = {}) {
  const { query = "", ...fetchOptions } = options;
  const response = await fetch(contentUrl(path, query), {
    ...fetchOptions,
    headers: {
      "Authorization": "Bearer " + token,
      "User-Agent": "PLAYER-Cloudflare-Worker/1.0",
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(fetchOptions.headers || {})
    }
  });
  let responseText = "";
  let data = {};
  try { responseText = await response.text(); } catch (_) {}
  try { data = responseText ? JSON.parse(responseText) : {}; } catch (_) {}
  if (!response.ok) {
    const error = new Error(data.message || responseText.slice(0, 700) || ("GitHub API returned " + response.status));
    error.status = response.status;
    error.githubDetails = {
      status: response.status,
      acceptedPermissions: response.headers.get("X-Accepted-GitHub-Permissions"),
      requestId: response.headers.get("X-GitHub-Request-Id"),
      rateLimitRemaining: response.headers.get("X-RateLimit-Remaining"),
      documentationUrl: data.documentation_url || null,
      body: responseText.slice(0, 700)
    };
    throw error;
  }
  return data;
}
async function getContent(path, token) {
  try {
    return await github(path, token, { method: "GET", query: "ref=" + encodeURIComponent(BRANCH) });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}
async function putTextFile(path, token, content, message, sha = null) {
  const payload = {
    message,
    branch: BRANCH,
    content: encodeTextBase64(content)
  };
  if (sha) payload.sha = sha;
  return github(path, token, { method: "PUT", body: JSON.stringify(payload) });
}
function parseJsonFile(file, fallback) {
  if (!file) return fallback;
  return JSON.parse(decodeBase64Text(file.content));
}
function safePlaylistName(value) {
  return String(value || "").trim().replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}
async function mutatePlaylists(token, update, message) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const file = await getContent("playlists.json", token);
    const data = parseJsonFile(file, { playlists: [] });
    if (!Array.isArray(data.playlists)) data.playlists = [];
    const outcome = update(data.playlists);
    if (!outcome.changed) return { playlists: data.playlists, result: outcome.result };
    try {
      await putTextFile("playlists.json", token, JSON.stringify(data, null, 2), message, file ? file.sha : null);
      return { playlists: data.playlists, result: outcome.result };
    } catch (error) {
      if ((error.status === 409 || error.status === 422) && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("Playlist data changed repeatedly. Please retry.");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "player-uploader", version: "shared-playlists-v2" });
    }

    if (!env.GH_TOKEN) return json({ error: "Worker is missing the GH_TOKEN secret." }, 500);

    // Public shared playlists: no admin key is needed for the PLAYER website.
    if (url.pathname === "/playlists" && request.method === "GET") {
      try {
        const file = await getContent("playlists.json", env.GH_TOKEN);
        const data = parseJsonFile(file, { playlists: [] });
        return json({ ok: true, playlists: Array.isArray(data.playlists) ? data.playlists : [] });
      } catch (error) {
        return json({ error: error.message || "Could not load shared playlists.", githubDetails: error.githubDetails || null }, error.status || 500);
      }
    }

    if (url.pathname === "/playlists" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch (_) { return json({ error: "Request body must be valid JSON." }, 400); }
      const name = safePlaylistName(body.name);
      if (!name) return json({ error: "Playlist name is required." }, 400);
      try {
        const updated = await mutatePlaylists(env.GH_TOKEN, list => {
          const duplicate = list.find(p => String(p.name || "").toLocaleLowerCase() === name.toLocaleLowerCase());
          if (duplicate) return { changed: false, result: { playlist: duplicate, alreadyExists: true } };
          if (list.length >= 200) return { changed: false, result: { error: "The shared library has reached its playlist limit." } };
          const playlist = { id: crypto.randomUUID(), name, tracks: [] };
          list.push(playlist);
          return { changed: true, result: { playlist, alreadyExists: false } };
        }, "Create shared playlist: " + name);
        if (updated.result.error) return json({ error: updated.result.error }, 429);
        return json({ ok: true, ...updated.result });
      } catch (error) {
        return json({ error: error.message || "Could not create shared playlist.", stage: "creating_playlist", githubDetails: error.githubDetails || null }, error.status || 500);
      }
    }

    if (url.pathname === "/playlists" && request.method === "PUT") {
      let body;
      try { body = await request.json(); } catch (_) { return json({ error: "Request body must be valid JSON." }, 400); }
      const id = String(body.id || "").trim();
      if (!id) return json({ error: "Playlist ID is required." }, 400);
      const hasName = Object.prototype.hasOwnProperty.call(body, "name");
      const name = hasName ? safePlaylistName(body.name) : "";
      if (hasName && !name) return json({ error: "Playlist name is required." }, 400);
      const addTracks = body.addTracks === undefined ? [] : body.addTracks;
      if (!Array.isArray(addTracks) || addTracks.length > 200) return json({ error: "addTracks must be a list of up to 200 track paths." }, 400);
      if (addTracks.some(path => typeof path !== "string" || path.length > 300)) return json({ error: "Invalid track path." }, 400);
      try {
        let validPaths = new Set();
        if (addTracks.length) {
          const tracksFile = await getContent("tracks.json", env.GH_TOKEN);
          const tracksData = parseJsonFile(tracksFile, { tracks: [] });
          validPaths = new Set((Array.isArray(tracksData.tracks) ? tracksData.tracks : []).map(track => track.src).filter(value => typeof value === "string"));
          const invalid = addTracks.filter(path => !validPaths.has(path));
          if (invalid.length) return json({ error: "One or more selected tracks are not in the public music library." }, 400);
        }
        const updated = await mutatePlaylists(env.GH_TOKEN, list => {
          const playlist = list.find(item => item.id === id);
          if (!playlist) return { changed: false, result: { error: "Playlist not found." } };
          if (hasName) {
            const duplicate = list.find(item => item.id !== id && String(item.name || "").toLocaleLowerCase() === name.toLocaleLowerCase());
            if (duplicate) return { changed: false, result: { error: "A playlist with this name already exists." } };
            playlist.name = name;
          }
          if (!Array.isArray(playlist.tracks)) playlist.tracks = [];
          const before = playlist.tracks.length;
          playlist.tracks = [...new Set([...playlist.tracks, ...addTracks])];
          return { changed: hasName || playlist.tracks.length !== before, result: { playlist } };
        }, "Update shared playlist");
        if (updated.result.error) return json({ error: updated.result.error }, updated.result.error === "Playlist not found." ? 404 : 409);
        return json({ ok: true, playlist: updated.result.playlist });
      } catch (error) {
        return json({ error: error.message || "Could not update shared playlist.", stage: "updating_playlist", githubDetails: error.githubDetails || null }, error.status || 500);
      }
    }

    const suppliedKey = request.headers.get("X-Upload-Key") || "";
    if (!env.UPLOAD_KEY || !secureEqual(suppliedKey, env.UPLOAD_KEY)) {
      return json({ error: "Upload key is incorrect." }, 401);
    }

    if (url.pathname === "/diagnostics" && request.method === "GET") {
      try {
        const file = await getContent("tracks.json", env.GH_TOKEN);
        if (!file) return json({ ok: false, error: "tracks.json was not found." }, 404);
        return json({ ok: true, repository: OWNER + "/" + REPO, permissionCheck: "Contents read succeeded", version: "playlists-v1" });
      } catch (error) {
        return json({ ok: false, error: error.message, stage: "reading_tracks_json", githubDetails: error.githubDetails || null }, error.status || 500);
      }
    }

    if (url.pathname === "/library" && request.method === "GET") {
      try {
        const [tracksFile, playlistsFile] = await Promise.all([
          getContent("tracks.json", env.GH_TOKEN),
          getContent("playlists.json", env.GH_TOKEN)
        ]);
        const tracksData = parseJsonFile(tracksFile, { tracks: [] });
        const playlistsData = parseJsonFile(playlistsFile, { playlists: [] });
        return json({
          ok: true,
          tracks: Array.isArray(tracksData.tracks) ? tracksData.tracks : [],
          playlists: Array.isArray(playlistsData.playlists) ? playlistsData.playlists : []
        });
      } catch (error) {
        return json({ error: error.message || "Could not load the library.", githubDetails: error.githubDetails || null }, error.status || 500);
      }
    }

    if (url.pathname !== "/upload" || request.method !== "POST") {
      return json({ error: "Not found." }, 404);
    }

    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > 30 * 1024 * 1024) {
      return json({ error: "Request is too large. Maximum audio size is 20 MB." }, 413);
    }

    let body;
    try { body = await request.json(); } catch (_) { return json({ error: "Request body must be valid JSON." }, 400); }
    const title = String(body.title || "").trim().slice(0, 180);
    const artist = String(body.artist || "Unknown artist").trim().slice(0, 180);
    const album = String(body.album || "Singles").trim().slice(0, 180);
    const originalName = String(body.fileName || "track.mp3").trim();
    const fileBase64 = String(body.fileBase64 || "").replace(/\s/g, "");
    const playlistId = String(body.playlistId || "").trim();
    const match = originalName.match(/\.[a-z0-9]+$/i);
    const extension = match ? match[0].toLowerCase() : ".mp3";

    if (!title) return json({ error: "Track title is required." }, 400);
    if (!EXTENSIONS.has(extension)) return json({ error: "Unsupported audio format." }, 415);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(fileBase64) || fileBase64.length < 8) {
      return json({ error: "Audio data is not valid base64." }, 400);
    }
    const approximateBytes = Math.floor(fileBase64.length * 3 / 4) -
      (fileBase64.endsWith("==") ? 2 : fileBase64.endsWith("=") ? 1 : 0);
    if (approximateBytes > MAX_AUDIO_BYTES) return json({ error: "Audio file exceeds the 20 MB limit." }, 413);

    let stage = "checking_playlist";
    let playlistFile = null;
    let playlistsData = { playlists: [] };
    try {
      if (playlistId) {
        playlistFile = await getContent("playlists.json", env.GH_TOKEN);
        playlistsData = parseJsonFile(playlistFile, { playlists: [] });
        if (!Array.isArray(playlistsData.playlists)) playlistsData.playlists = [];
        const selected = playlistsData.playlists.find(p => p.id === playlistId);
        if (!selected) return json({ error: "Selected playlist was not found. Refresh the upload page and choose again." }, 404);
      }

      const base = cleanName(originalName);
      let filePath = "music/" + base + extension;
      stage = "checking_existing_filename";
      let collision = await getContent(filePath, env.GH_TOKEN);
      let suffix = 2;
      while (collision && suffix < 100) {
        filePath = "music/" + base + "-" + suffix + extension;
        collision = await getContent(filePath, env.GH_TOKEN);
        suffix++;
      }
      if (collision) return json({ error: "Could not find a unique filename. Rename the file and retry." }, 409);

      stage = "uploading_audio_file";
      await github(filePath, env.GH_TOKEN, {
        method: "PUT",
        body: JSON.stringify({ message: "Add audio track: " + title, branch: BRANCH, content: fileBase64 })
      });

      stage = "reading_tracks_json";
      const tracksFile = await getContent("tracks.json", env.GH_TOKEN);
      const tracksData = parseJsonFile(tracksFile, { tracks: [] });
      if (!Array.isArray(tracksData.tracks)) tracksData.tracks = [];
      tracksData.tracks.push({ title, artist, album, src: filePath });

      stage = "updating_tracks_json";
      await putTextFile("tracks.json", env.GH_TOKEN, JSON.stringify(tracksData, null, 2), "Add track: " + title, tracksFile ? tracksFile.sha : null);

      if (playlistId) {
        stage = "updating_playlists_json";
        const selected = playlistsData.playlists.find(p => p.id === playlistId);
        if (!Array.isArray(selected.tracks)) selected.tracks = [];
        if (!selected.tracks.includes(filePath)) selected.tracks.push(filePath);
        await putTextFile("playlists.json", env.GH_TOKEN, JSON.stringify(playlistsData, null, 2), "Add track to playlist: " + selected.name, playlistFile ? playlistFile.sha : null);
      }

      return json({ ok: true, track: { title, artist, album, src: filePath, playlistId } });
    } catch (error) {
      return json({
        error: error.message || "Upload failed.",
        stage,
        githubDetails: error.githubDetails || null,
        audioMayAlreadyBeUploaded: ["reading_tracks_json", "updating_tracks_json", "updating_playlists_json"].includes(stage)
      }, error.status && error.status < 500 ? error.status : 500);
    }
  }
};
