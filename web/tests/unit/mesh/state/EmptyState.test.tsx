import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/mesh/state/EmptyState";

describe("EmptyState", () => {
  it("renders title, message, hint and action", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="No agents connected yet"
        message="Install one on any host to get started."
        hint={<code>curl -sSL https://core.lan/install.sh | sh</code>}
        action={<button type="button">Generate token</button>}
      />,
    );
    expect(html).toContain("No agents connected yet");
    expect(html).toContain("Install one on any host");
    expect(html).toContain("curl -sSL");
    expect(html).toContain("Generate token");
  });

  it("renders the decorative blueprint SVG by default", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="Empty" message="…" />,
    );
    expect(html).toContain('data-component="mesh-empty-blueprint"');
    expect(html).toContain("mesh-empty-grid");
  });

  it("swaps the decoration for a Lucide icon when one is supplied", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="Empty" message="…" icon={Plus} />,
    );
    expect(html).not.toContain('data-component="mesh-empty-blueprint"');
    // Lucide renders an <svg> with a lucide class
    expect(html).toMatch(/lucide-plus/);
  });

  it("uses the inline variant attribute when inline=true", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No rows" message="Try adjusting filters." inline />,
    );
    expect(html).toContain('data-variant="inline"');
    expect(html).not.toContain('data-component="mesh-empty-blueprint"');
  });
});
