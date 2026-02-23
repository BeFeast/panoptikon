const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Download a file from an export API endpoint.
 * Triggers a browser download with the given filename.
 */
export async function downloadExport(url: string, filename: string) {
  const res = await fetch(`${API_BASE}${url}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
