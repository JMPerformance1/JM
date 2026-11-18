import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workerSource = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const startMarker = 'if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {';
const endMarker = 'const me = await appAuth(env, request);';
const start = workerSource.indexOf(startMarker);
const end = workerSource.indexOf(endMarker, start);

assert.notEqual(start, -1, "origin guard start marker must exist");
assert.notEqual(end, -1, "same-origin fallback guard must exist");
const guardSource = workerSource.slice(start, end);
const runOriginGuard = new Function("request", "env", "url", guardSource + "\nreturn null;");
const env = { PUBLIC_APP_ORIGIN: "https://jmperformance.app.br" };

function check({ url = "https://jmperformance.app.br/api/auth/login", headers = {} } = {}) {
  const request = new Request(url, { method: "POST", headers });
  return runOriginGuard(request, env, new URL(url));
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
  assert.equal(check({ url: "https://jmperformance.app.br/api/account/update" }).status, 403);
});


test("accepts auth requests on the canonical host when embedded WebView metadata is omitted", () => {
  assert.equal(check(), null);
  assert.equal(check({ url: "https://jmperformance.app.br/api/auth/signup" }), null);
});

test("accepts Instagram WebView same-origin metadata with an external Referer", () => {
  assert.equal(check({ headers: { referer: "https://l.instagram.com/", "sec-fetch-site": "same-origin" } }), null);
});

test("accepts opaque Origin on canonical auth routes", () => {
  assert.equal(check({ headers: { origin: "null", "sec-fetch-site": "same-origin" } }), null);
  assert.equal(check({ headers: { origin: "null", referer: "https://l.instagram.com/", "sec-fetch-site": "cross-site" } }), null);
});

test("accepts Instagram external Referer and cross-site metadata when Origin is omitted", () => {
  assert.equal(check({ headers: { referer: "https://l.instagram.com/", "sec-fetch-site": "cross-site" } }), null);
});

test("accepts Instagram IAB origin on canonical login and signup routes", () => {
  const headers = {
    origin: "https://www.instagram.com",
    referer: "https://l.instagram.com/",
    "sec-fetch-site": "cross-site",
    "user-agent": "Mozilla/5.0 (Linux; Android 14) Instagram 456.0.0.53.78 Android; IABMV/1",
  };
  assert.equal(check({ headers }), null);
  assert.equal(check({ url: "https://jmperformance.app.br/api/auth/signup", headers }), null);
});

test("still rejects explicit foreign Origins outside Instagram IAB auth", () => {
  assert.equal(check({ headers: { origin: "https://instagram.com", referer: "https://l.instagram.com/", "sec-fetch-site": "cross-site" } }).status, 403);
  assert.equal(check({ headers: { origin: "https://attacker.example", "user-agent": "Instagram 456; IABMV/1" } }).status, 403);
});

test("does not extend missing-metadata fallback to other API routes", () => {
  assert.equal(check({ url: "https://jmperformance.app.br/api/account/update" }).status, 403);
});

test("accepts omitted Origin on canonical auth route despite cross-site metadata", () => {
  assert.equal(check({ headers: { "sec-fetch-site": "cross-site" } }), null);
  assert.equal(check({ url: "https://jmperformance.app.br/api/account/update", headers: { "sec-fetch-site": "cross-site" } }).status, 403);
});

test("rejects an untrusted Origin even if fetch metadata says same-origin", () => {
  assert.equal(check({ headers: { origin: "https://attacker.example", "sec-fetch-site": "same-origin" } }).status, 403);
});

test("rejects same-origin metadata sent to a non-canonical request host", () => {
  assert.equal(check({ url: "https://attacker.example/api/auth/login", headers: { "sec-fetch-site": "same-origin" } }).status, 403);
});
