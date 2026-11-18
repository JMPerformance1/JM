# JM Performance

This repository holds the recoverable source snapshot for the JM Performance Cloudflare Worker, including the Instagram in-app browser origin check correction deployed to production on 2026-11-18 (Worker version 56).

## Source and deployment scope

The Worker source was reconstructed from the source map attached to the deployed production Worker. Cloudflare-managed static assets remain attached to the production `ASSETS` binding and are not included in this snapshot. Secrets are not stored in this repository; they remain in Cloudflare Worker bindings.

The Worker currently uses Cloudflare D1 and R2 bindings. Deployments should preserve the existing production configuration and secrets. Do not upload a new Worker configuration that replaces bindings.

## Instagram browser correction

For unsafe HTTP methods, same-origin requests may lack both `Origin` and `Referer` in some embedded browsers. The Worker now permits this case only when `Sec-Fetch-Site: same-origin` and the request URL origin exactly matches the configured public app origin. Other mismatched or missing-origin mutations remain forbidden.

## Verification

- The production members page loaded after deployment.
- A synthetic invalid login reached the normal authentication result ("Credenciais inválidas.") rather than an origin-guard 403.
- Staging was smoke-tested with the same synthetic invalid-login flow.
- Confirm the final behavior inside Instagram on the affected iPhone. This browser environment cannot exercise Instagram's embedded WebView.

## Configuration caveat

This repository begins as a source recovery snapshot; it is not yet a complete reproducible deployment pipeline. The static asset bundle and original build/deploy configuration need to be added before using GitHub Actions or Wrangler to replace the live Worker.
