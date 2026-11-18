const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function cleanHostname(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function youtubeVideoId(url, hostname) {
  if (hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
  const shorts = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/)?$/);
  if (shorts) return shorts[1];
  const embed = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})(?:\/)?$/);
  if (embed) return embed[1];
  return url.pathname === "/watch" ? url.searchParams.get("v") : null;
}

export function normalizeVideoUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const hostname = cleanHostname(url.hostname);
  if (YOUTUBE_HOSTS.has(hostname)) {
    const id = youtubeVideoId(url, hostname);
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return {
      provider: "youtube",
      originalUrl: url.toString(),
    };
  }

  if (VIMEO_HOSTS.has(hostname)) {
    const match = url.pathname.match(/\/(?:video\/)?(\d+)(?:\/)?$/);
    if (!match) return null;
    return {
      provider: "vimeo",
      originalUrl: url.toString(),
    };
  }

  return null;
}

export function safeExternalVideoUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
