/**
 * Custom worker entry — extends the OpenNext-generated worker with the
 * PodController Durable Object class.
 *
 * Per the documented OpenNext pattern (opennext.js.org/cloudflare/howtos/custom-worker):
 * re-export the generated fetch handler as the default export and add any
 * extra DO classes this project owns. `wrangler.jsonc` `main` points here.
 */

// @ts-ignore — `.open-next/worker.js` is generated at build time by opennextjs-cloudflare
import { default as handler } from "./.open-next/worker.js";

// NOTE on the deploy-time warning "no such Durable Object class is exported from
// the worker": it is a false positive from `opennextjs-cloudflare deploy`'s
// pre-deploy `getPlatformProxy` boot, which starts a bindings-only proxy worker
// that by design does not register user-defined DO classes (the preceding
// "These will not work in local development, but they should work in production"
// warning says exactly that). It is NOT caused by `@/*` alias resolution — a
// no-alias minimal DO app reproduces the same warning, while the real upload
// path (`wrangler deploy`, dry-run verified) bundles and exports PodController
// correctly with no warning — no source change is needed.
export { PodController } from "@/lib/pod/PodController";
export default {
  fetch: handler.fetch,
} satisfies ExportedHandler;
