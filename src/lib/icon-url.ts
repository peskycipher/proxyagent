/**
 * Normalize a statically imported image asset to its URL, whatever shape the
 * bundler emits:
 * - webpack / next image-types: `StaticImageData` (`{ src, height, width, ... }`)
 * - Turbopack (next dev & next build): ES asset module (`{ default: url }`)
 * - plain URL string (asset/resource)
 *
 * Assumes the StaticImageData/asset shapes only ever appear for images.
 */
export type IconAsset = string | { src?: string; default?: string };

export function iconUrl(icon: IconAsset): string {
  if (typeof icon === "string") return icon;
  return icon.src ?? icon.default ?? "";
}