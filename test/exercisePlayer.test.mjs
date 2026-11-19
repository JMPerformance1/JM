import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import worker from "../server.js";
import { exercisePlayerScript, injectExercisePlayer } from "../utils/exercisePlayer.js";

test("injects the player script once before the closing body", () => {
  const html = "<!doctype html><html><body><main>App</main></body></html>";
  const result = injectExercisePlayer(html);
  assert.match(result, /<script defer src="\/__jm\/exercise-player\.js" data-jm-exercise-player><\/script><\/body>/);
  assert.equal(injectExercisePlayer(result), result);
});

test("serves HTML with the player and CSP permits provider frames", async () => {
  const app = await worker.fetch(new Request("https://jmperformance.app.br/membros/"), {
    APP_ENV: "production",
    ASSETS: { fetch: async () => new Response("<!doctype html><html><body>JM</body></html>", { headers: { "Content-Type": "text/html", "ETag": "asset-v1" } }) },
  }, {});
  const html = await app.text();
  assert.equal(app.status, 200);
  assert.match(html, /data-jm-exercise-player/);
  assert.match(app.headers.get("Content-Security-Policy"), /frame-src[^;]*https:\/\/www\.youtube\.com/);
  assert.match(app.headers.get("Content-Security-Policy"), /https:\/\/player\.vimeo\.com/);
  assert.equal(app.headers.get("ETag"), null);
  assert.equal(app.headers.get("Cache-Control"), "no-cache");
});

class MockElement {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.dataset = {}; this.style = {}; this.attributes = {}; this.children = []; this.listeners = {}; this.textContent = ""; this.href = ""; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  append(...children) { this.children.push(...children); }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  matches(selector) { return selector === "a[href]" && Boolean(this.href); }
  insertAdjacentElement(position, element) { this.inserted = { position, element }; }
  closest(selector) { return selector === "a[href]" ? this.link || null : null; }
}

function clickVideoLink(href) {
  const documentListeners = {};
  const body = new MockElement("body");
  const document = {
    body,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new MockElement(tag),
    addEventListener: (name, callback) => { documentListeners[name] = callback; },
    removeEventListener: (name) => { delete documentListeners[name]; },
  };
  const window = { __jmExercisePlayerInstalled: false, location: { href: "https://jmperformance.app.br/membros/", origin: "https://jmperformance.app.br" } };
  vm.runInNewContext(exercisePlayerScript, { window, document, Element: MockElement, URL, URLSearchParams });
  const link = new MockElement("a");
  link.href = href;
  link.textContent = "Assistir demonstração";
  const target = new MockElement("span");
  target.link = link;
  const event = { target, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
  documentListeners.click(event);
  return { event, dialog: body.children[0] };
}

function mountInlineVideoLink(href) {
  const documentListeners = {};
  const body = new MockElement("body");
  const link = new MockElement("a");
  link.href = href;
  link.textContent = "Vídeo do exercício";
  const document = {
    body,
    querySelector: () => null,
    querySelectorAll: () => [link],
    createElement: (tag) => new MockElement(tag),
    addEventListener: (name, callback) => { documentListeners[name] = callback; },
    removeEventListener: (name) => { delete documentListeners[name]; },
  };
  const window = { __jmExercisePlayerInstalled: false, location: { href: "https://jmperformance.app.br/membros/", origin: "https://jmperformance.app.br" } };
  vm.runInNewContext(exercisePlayerScript, { window, document, Element: MockElement, URL, URLSearchParams });
  return { link, region: link.inserted?.element, documentListeners };
}

test("intercepts valid YouTube links and preserves the start time in the embedded player", () => {
  const { event, dialog } = clickVideoLink("https://www.youtube.com/watch?v=rrJIyZGlK8c&t=50s");
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.stopped, true);
  const frame = dialog.children[0].children[2].children[0];
  assert.equal(frame.src, "https://www.youtube.com/embed/rrJIyZGlK8c?playsinline=1&origin=https%3A%2F%2Fjmperformance.app.br&start=50");
  assert.equal(frame.referrerPolicy, "origin");
  assert.equal(frame.allowFullscreen, true);
});

test("mounts exercise videos inline automatically and keeps an external fallback", () => {
  const { link, region } = mountInlineVideoLink("https://www.youtube.com/watch?v=rrJIyZGlK8c&t=50s");
  assert.equal(link.hidden, true);
  assert.equal(link.dataset.jmInlinePlayerMounted, "true");
  assert.equal(region.dataset.jmInlinePlayer, "");
  const frame = region.children[0].children[0];
  assert.equal(frame.src, "https://www.youtube.com/embed/rrJIyZGlK8c?playsinline=1&origin=https%3A%2F%2Fjmperformance.app.br&start=50");
  assert.equal(frame.loading, "lazy");
  assert.equal(region.children[1].href, "https://www.youtube.com/watch?v=rrJIyZGlK8c&t=50s");
});

test("intercepts Vimeo exercise links and leaves unrelated domains untouched", () => {
  const vimeo = clickVideoLink("https://vimeo.com/123456789");
  const frame = vimeo.dialog.children[0].children[2].children[0];
  assert.equal(frame.src, "https://player.vimeo.com/video/123456789?playsinline=1");
  const other = clickVideoLink("https://example.com/exercise");
  assert.equal(other.event.defaultPrevented, false);
  assert.equal(other.dialog, undefined);
});
