/**
 * OS family display labels and color classes for device enrichment badges.
 */

export interface OsDisplay {
  label: string;
  colorClass: string;
}

const OS_DISPLAY: Record<string, OsDisplay> = {
  ios: { label: "iOS", colorClass: "border-sky-500/50 text-sky-400" },
  ipados: { label: "iPadOS", colorClass: "border-sky-500/50 text-sky-400" },
  macos: { label: "macOS", colorClass: "border-sky-500/50 text-sky-400" },
  tvos: { label: "tvOS", colorClass: "border-sky-500/50 text-sky-400" },
  audioos: { label: "audioOS", colorClass: "border-sky-500/50 text-sky-400" },
  android: { label: "Android", colorClass: "border-green-500/50 text-green-400" },
  windows: { label: "Windows", colorClass: "border-blue-500/50 text-blue-400" },
  linux: { label: "Linux", colorClass: "border-orange-500/50 text-orange-400" },
};

/**
 * Get display information for an OS family string.
 */
export function getOsDisplay(osFamily: string | null | undefined): OsDisplay | null {
  if (!osFamily) return null;
  return OS_DISPLAY[osFamily.toLowerCase()] ?? {
    label: osFamily,
    colorClass: "border-slate-500/50 text-slate-400",
  };
}
