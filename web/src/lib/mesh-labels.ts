import type { XiaomiTopoLeaf, XiaomiTopoNode } from "@/lib/types";

/**
 * Xiaomi MiWiFi firmware reports placeholder strings (`default`, `node`, ...)
 * for the locale of mesh satellites that the user has not relabelled in the
 * app. Treat those as "no label" so the real `name` wins. See #807.
 */
const PLACEHOLDER_LABELS = new Set([
  "",
  "default",
  "node",
  "router",
  "mesh",
  "unknown",
]);

export function isPlaceholderMeshLabel(
  value: string | null | undefined,
): boolean {
  if (value == null) return true;
  return PLACEHOLDER_LABELS.has(value.trim().toLowerCase());
}

/** Pick the best human-readable label for a mesh node. */
export function meshNodeLabel(node: XiaomiTopoNode): string {
  if (!isPlaceholderMeshLabel(node.name)) return node.name as string;
  if (!isPlaceholderMeshLabel(node.locale)) return node.locale as string;
  if (node.ip) return node.ip;
  if (node.mac) return node.mac;
  return "Mesh Node";
}

/** Pick the best human-readable label for a connected leaf device. */
export function meshLeafLabel(leaf: XiaomiTopoLeaf): string {
  if (!isPlaceholderMeshLabel(leaf.name)) return leaf.name as string;
  if (leaf.ip) return leaf.ip;
  if (leaf.mac) return leaf.mac;
  return "Device";
}
