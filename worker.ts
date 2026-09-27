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

export { PodController } from "@/lib/pod/PodController";
export default {
  fetch: handler.fetch,
} satisfies ExportedHandler;