const OWNER = "mohamed20034";
const REPO = "mohsenplayer";
const BRANCH = "main";
const ALLOWED_ORIGIN = "https://mohamed20034.github.io";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".opus", ".webm"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Vary": "Origin"
    }
  });
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Upload-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
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
      rateLimitReset: response.headers.get("X-RateLimit-Reset"),
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
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ ok: true, service: "mohsen-player-uploader", version: "diagnostic-v5" }), {
        headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    const suppliedKey = request.headers.get("X-Upload-Key") || "";
    if (url.pathname === "/diagnostics" && request.method === "GET") {
      if (!env.UPLOAD_KEY || !secureEqual(suppliedKey, env.UPLOAD_KEY)) return json({ error: "Upload key is incorrect." }, 401);
      if (!env.GH_TOKEN) return json({ error: "Worker is missing the GH_TOKEN secret." }, 500);
      try {
        const file = await getContent("tracks.json", env.GH_TOKEN);
        if (!file) return json({ ok: false, stage: "reading_tracks_json", error: "GitHub token could not find tracks.json in the configured repository." }, 404);
        return json({ ok: true, version: "diagnostic-v5", repository: OWNER + "/" + REPO, permissionCheck: "Contents read succeeded", tracksJsonSha: file.sha });
      } catch (error) {
        return json({
          ok: false,
          error: error.message || "GitHub permission check failed.",
          stage: "reading_tracks_json",
          githubDetails: error.githubDetails || null
        }, error.status && error.status < 500 ? error.status : 500);
      }
    }

    if (url.pathname !== "/upload" || request.method !== "POST") return json({ error: "Not found." }, 404);
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

    if (!env.UPLOAD_KEY || !secureEqual(suppliedKey, env.UPLOAD_KEY)) return json({ error: "Upload key is incorrect." }, 401);
    if (!env.GH_TOKEN) return json({ error: "Worker is missing the GH_TOKEN secret." }, 500);

    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > 30 * 1024 * 1024) return json({ error: "Request is too large. Maximum audio size is 20 MB." }, 413);

    let body;
    try { body = await request.json(); } catch (_) { return json({ error: "Request body must be valid JSON." }, 400); }
    const title = String(body.title || "").trim().slice(0, 180);
    const artist = String(body.artist || "Unknown artist").trim().slice(0, 180);
    const album = String(body.album || "Singles").trim().slice(0, 180);
    const originalName = String(body.fileName || "track.mp3").trim();
    const fileBase64 = String(body.fileBase64 || "").replace(/\s/g, "");
    const match = originalName.match(/\.[a-z0-9]+$/i);
    const extension = match ? match[0].toLowerCase() : ".mp3";
    if (!title) return json({ error: "Track title is required." }, 400);
    if (!EXTENSIONS.has(extension)) return json({ error: "Unsupported audio format." }, 415);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(fileBase64) || fileBase64.length < 8) return json({ error: "Audio data is not valid base64." }, 400);
    const approximateBytes = Math.floor(fileBase64.length * 3 / 4) - (fileBase64.endsWith("==") ? 2 : fileBase64.endsWith("=") ? 1 : 0);
    if (approximateBytes > MAX_AUDIO_BYTES) return json({ error: "Audio file exceeds the 20 MB limit." }, 413);

    const base = cleanName(originalName);
    let filePath = "music/" + base + extension;
    let stage = "checking_existing_filename";
    try {
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
      const catalogueFile = await getContent("tracks.json", env.GH_TOKEN);
      if (!catalogueFile) throw new Error("Audio was uploaded, but tracks.json was not found.");
      const catalogue = JSON.parse(decodeBase64Text(catalogueFile.content));
      if (!Array.isArray(catalogue.tracks)) catalogue.tracks = [];
      catalogue.tracks.push({ title, artist, album, src: filePath });

      stage = "updating_tracks_json";
      await github("tracks.json", env.GH_TOKEN, {
        method: "PUT",
        body: JSON.stringify({
          message: "Update music catalogue: " + title,
          branch: BRANCH,
          sha: catalogueFile.sha,
          content: encodeTextBase64(JSON.stringify(catalogue, null, 2))
        })
      });
      return json({ ok: true, track: { title, artist, album, src: filePath } });
    } catch (error) {
      return json({
        error: error.message || "Upload failed.",
        stage,
        githubDetails: error.githubDetails || null,
        audioMayAlreadyBeUploaded: stage === "reading_tracks_json" || stage === "updating_tracks_json"
      }, error.status && error.status < 500 ? error.status : 500);
    }
  }
};
