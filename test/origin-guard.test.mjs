import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workerSource = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const startMarker = 'const origin = request.headers.get("origin");';
const endMarker = 'if (rawOriginMismatch && (!expectedAuthOrigin || receivedAuthOrigin !== expectedAuthOrigin) && !sameOriginFallback) return new Response("Forbidden", { status: 403 });';
const start = workerSource.indexOf(startMarker);
const end = workerSource.indexOf(endMarker, start);

assert.notEqual(start, -1, "origin guard start marker must exist");
assert.notEqual(end, -1, "same-origin fallback guard must exist");
const guardSource = workerSource.slice(start, end + endMarker.length);
const runOriginGuard = new Function("request", "env", `${guardSource}\nreturn null;`);
const env = { PUBLIC_APP_ORIGIN: "https://jmperformance.app.br" };

function check({ url = "https://jmperformance.app.br/api/auth/login", headers = {} } = {}) {
  const request = new Request(url, { method: "POST", headers });
  return runOriginGuard(request, env);
}

test("accepts an exact trusted Origin", () => {
  assert.equal(check({ headers: { origin: "https://jmperformance.app.br" } }), null);
});

test("accepts trusted Referer when Origin is absent", () => {
  assert.equal(check({ headers: { referer: "https://jmperformance.app.br/membros/" } }), null);
});

test("accepts embedded-browser same-origin metadata when Origin and Referer are absent", () => {
  assert.equal(check({ headers: { "sec-fetch-site": "same-origin" } }), null);
});

test("rejects missing origin metadata when Sec-Fetch-Site is absent", () => {
  assert.equal(check().status, 403);
});

test("rejects cross-site metadata when Origin and Referer are absent", () => {
  assert.equal(check({ headers: { "sec-fetch-site": "cross-site" } }).status, 403);
});

test("rejects an untrusted Origin even if fetch metadata says same-origin", () => {
  assert.equal(check({ headers: { origin: "https://attacker.example", "sec-fetch-site": "same-origin" } }).status, 403);
});

test("rejects same-origin metadata sent to a non-canonical request host", () => {
  assert.equal(check({ url: "https://attacker.example/api/auth/login", headers: { "sec-fetch-site": "same-origin" } }).status, 403);
});
