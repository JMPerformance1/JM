export const EXERCISE_PLAYER_PATH = "/__jm/exercise-player.js";

export function injectExercisePlayer(html) {
  if (typeof html !== "string" || /data-jm-exercise-player/i.test(html)) return html;
  const tag = `<script defer src="${EXERCISE_PLAYER_PATH}" data-jm-exercise-player></script>`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${tag}</body>`)
    : `${html}${tag}`;
}

export const exercisePlayerScript = String.raw`(() => {
  if (window.__jmExercisePlayerInstalled) return;
  window.__jmExercisePlayerInstalled = true;

  const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
  const vimeoHosts = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
  const idPattern = /^[A-Za-z0-9_-]{11}$/;

  function videoFromLink(raw) {
    let url;
    try { url = new URL(raw, window.location.href); } catch { return null; }
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (youtubeHosts.has(host)) {
      let id = null;
      if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || null;
      else if (url.pathname === "/watch") id = url.searchParams.get("v");
      else id = url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})(?:\/)?$/)?.[1] || null;
      if (!idPattern.test(id || "")) return null;
      let start = url.searchParams.get("start") || url.searchParams.get("t") || "";
      if (/^\d+m\d+s$/.test(start)) { const [m, s] = start.match(/\d+/g).map(Number); start = String(m * 60 + s); }
      else if (/^\d+s$/.test(start)) start = start.slice(0, -1);
      else if (!/^\d+$/.test(start)) start = "";
      return { provider: "youtube", id, start, original: url.href };
    }
    if (vimeoHosts.has(host)) {
      const id = url.pathname.match(/\/(?:video\/)?(\d+)(?:\/)?$/)?.[1];
      return id ? { provider: "vimeo", id, original: url.href } : null;
    }
    return null;
  }

  function openPlayer(video, title) {
    document.querySelector("[data-jm-player-dialog]")?.remove();
    const dialog = document.createElement("div");
    dialog.dataset.jmPlayerDialog = "";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "jm-player-title");
    dialog.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box";

    const panel = document.createElement("section");
    panel.style.cssText = "position:relative;width:min(100%,800px);background:#101214;color:#fff;border:1px solid #34383d;border-radius:16px;padding:16px;box-sizing:border-box;font:16px/1.45 system-ui,-apple-system,sans-serif";
    const heading = document.createElement("h2");
    heading.id = "jm-player-title";
    heading.textContent = title || "Vídeo do exercício";
    heading.style.cssText = "font-size:18px;margin:0 48px 14px 0";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fechar";
    close.setAttribute("aria-label", "Fechar vídeo");
    close.style.cssText = "position:absolute;right:12px;top:12px;border:1px solid #555;background:#24282d;color:white;border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer";
    const frameWrap = document.createElement("div");
    frameWrap.style.cssText = "width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden";
    const frame = document.createElement("iframe");
    frame.title = title || "Demonstração em vídeo do exercício";
    frame.loading = "eager";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "origin";
    frame.style.cssText = "display:block;width:100%;height:100%;border:0";
    if (video.provider === "youtube") {
      const query = new URLSearchParams({ playsinline: "1", origin: window.location.origin });
      if (video.start) query.set("start", video.start);
      frame.src = "https://www.youtube.com/embed/" + encodeURIComponent(video.id) + "?" + query.toString();
    } else {
      frame.src = "https://player.vimeo.com/video/" + encodeURIComponent(video.id) + "?playsinline=1";
    }
    const fallback = document.createElement("a");
    fallback.href = video.original;
    fallback.target = "_blank";
    fallback.rel = "noopener noreferrer";
    fallback.textContent = video.provider === "youtube" ? "Se o vídeo não carregar, abrir no YouTube" : "Se o vídeo não carregar, abrir no Vimeo";
    fallback.style.cssText = "display:inline-block;margin-top:12px;color:#65e6bd;text-underline-offset:3px";

    const closeDialog = () => { dialog.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (event) => { if (event.key === "Escape") closeDialog(); };
    close.addEventListener("click", closeDialog);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
    document.addEventListener("keydown", onKey);
    frameWrap.append(frame);
    panel.append(heading, close, frameWrap, fallback);
    dialog.append(panel);
    document.body.append(dialog);
    close.focus();
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) return;
    const video = videoFromLink(link.href);
    if (!video) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openPlayer(video, link.getAttribute("aria-label") || link.textContent.trim() || "Vídeo do exercício");
  }, true);
})();`;
