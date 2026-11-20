export const EXERCISE_PLAYER_PATH = "/__jm/exercise-player.js";

export function injectExercisePlayer(html) {
  if (typeof html !== "string" || /data-jm-exercise-player/i.test(html)) return html;
  const guard = `<style data-jm-player-guard>@keyframes jm-player-fallback { to { visibility:visible; } } html[data-jm-player-pending] a[href*="youtube.com"],html[data-jm-player-pending] a[href*="youtu.be"],html[data-jm-player-pending] a[href*="vimeo.com"] { visibility:hidden !important; animation:jm-player-fallback 0s linear 2s forwards; }</style>`;
  const tag = `<script defer src="${EXERCISE_PLAYER_PATH}?v=20261119-2" data-jm-exercise-player></script>`;
  let output = html.replace(/<html\b([^>]*)>/i, (match, attributes) =>
    /\bdata-jm-player-pending\b/i.test(attributes)
      ? match
      : `<html${attributes} data-jm-player-pending>`
  );
  output = /<\/head\s*>/i.test(output)
    ? output.replace(/<\/head\s*>/i, `${guard}</head>`)
    : output.replace(/<body\b[^>]*>/i, (match) => `${match}${guard}`);
  return /<\/body\s*>/i.test(output)
    ? output.replace(/<\/body\s*>/i, `${tag}</body>`)
    : `${output}${tag}`;
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

  function embedUrl(video) {
    if (video.provider === "youtube") {
      const query = new URLSearchParams({ playsinline: "1", origin: window.location.origin });
      if (video.start) query.set("start", video.start);
      return "https://www.youtube.com/embed/" + encodeURIComponent(video.id) + "?" + query.toString();
    }
    return "https://player.vimeo.com/video/" + encodeURIComponent(video.id) + "?playsinline=1";
  }

  function createFrame(video, title) {
    const frame = document.createElement("iframe");
    frame.title = title || "Demonstração em vídeo do exercício";
    frame.loading = "lazy";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "origin";
    frame.style.cssText = "display:block;width:100%;height:100%;border:0";
    frame.src = embedUrl(video);
    return frame;
  }

  function fallbackLink(video, title) {
    const fallback = document.createElement("a");
    fallback.dataset.jmPlayerFallback = "";
    fallback.href = video.original;
    fallback.target = "_blank";
    fallback.rel = "noopener noreferrer";
    fallback.textContent = video.provider === "youtube" ? "Se o vídeo não carregar, abrir no YouTube" : "Se o vídeo não carregar, abrir no Vimeo";
    fallback.setAttribute("aria-label", (title || "Vídeo do exercício") + " — abrir externamente");
    fallback.style.cssText = "display:inline-block;margin-top:8px;color:#65e6bd;text-underline-offset:3px";
    return fallback;
  }

  function mountInlinePlayer(link, video) {
    if (link.dataset.jmInlinePlayerMounted || link.closest("[data-jm-inline-player]")) return;
    link.dataset.jmInlinePlayerMounted = "true";
    const title = link.getAttribute("aria-label") || link.textContent.trim() || "Vídeo do exercício";
    const region = document.createElement("section");
    region.dataset.jmInlinePlayer = "";
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", title);
    region.style.cssText = "width:min(100%,560px);margin:12px 0;box-sizing:border-box";
    const frameWrap = document.createElement("div");
    frameWrap.style.cssText = "width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden";
    frameWrap.append(createFrame(video, title));
    region.append(frameWrap, fallbackLink(video, title));
    link.hidden = true;
    link.insertAdjacentElement("afterend", region);
  }

  function scanForExerciseVideos(root) {
    if (!(root instanceof Element) && root !== document && typeof root?.querySelectorAll !== "function") return;
    const links = [];
    if (root instanceof Element && root.matches("a[href]")) links.push(root);
    links.push(...root.querySelectorAll("a[href]"));
    links.forEach((link) => {
      if (link.dataset.jmPlayerFallback || link.dataset.jmInlinePlayerMounted) return;
      const video = videoFromLink(link.href);
      if (video) mountInlinePlayer(link, video);
    });
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
    const frame = createFrame(video, title);
    frame.loading = "eager";
    const fallback = fallbackLink(video, title);

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
    if (!link || link.dataset.jmPlayerFallback) return;
    const video = videoFromLink(link.href);
    if (!video) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openPlayer(video, link.getAttribute("aria-label") || link.textContent.trim() || "Vídeo do exercício");
  }, true);

  scanForExerciseVideos(document);
  document.documentElement?.removeAttribute("data-jm-player-pending");
  if (document.body && typeof MutationObserver !== "undefined") {
    new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => scanForExerciseVideos(node))))
      .observe(document.body, { childList: true, subtree: true });
  }
})();`;
