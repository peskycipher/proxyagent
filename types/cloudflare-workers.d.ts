/**
 * Minimal ambient types for Cloudflare Workers runtime APIs not shipped by
 * any installed package (no @cloudflare/workers-types in this repo). Covers
 * only what this project uses: the DurableObject base class, DO storage with
 * alarms, and typed DO namespaces. Extend deliberately — the real shapes are
 * broader (developers.cloudflare.com/durable-objects).
 *
 * Script file on purpose: `declare module "cloudflare:workers"` in a module
 * (a file with imports/exports) would parse as module *augmentation* of a
 * nonexistent module and fail. Keep this file import-free and export-free.
 */

declare module "cloudflare:workers" {
  export class DurableObject {
    ctx: DurableObjectState;
    env: unknown;
    constructor(ctx: DurableObjectState, env: unknown);
  }
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list<T>(opts?: { prefix?: string }): Promise<Map<string, T>>;
  setAlarm(scheduledTime: number): Promise<void>;
  getAlarm(): Promise<number | null>;
  deleteAlarm(): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  waitUntil(promise: Promise<unknown>): void;
}

interface DurableObjectNamespace<T extends object> {
  getByName(name: string): T;
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): T;
}

interface ExportedHandler {
  fetch?(request: Request, env: unknown, ctx: unknown): Response | Promise<Response>;
}

interface CloudflareEnv {
  // Cast at the call site to the concrete PodController type (types/ must
  // stay import-free — see the header note).
  POD_CONTROLLER?: DurableObjectNamespace<object>;
}