import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailsHeader } from "@/components/mesh/details/DetailsHeader";

describe("DetailsHeader", () => {
  it("renders title, eyebrow and meta", () => {
    const html = renderToStaticMarkup(
      <DetailsHeader
        eyebrow="Device"
        title="nas-01"
        meta={<span>10.0.1.12</span>}
      />,
    );
    expect(html).toContain("Device");
    expect(html).toContain("nas-01");
    expect(html).toContain("10.0.1.12");
    expect(html).toContain('data-component="mesh-details-header"');
  });

  it("renders the icon glyph when an icon name is supplied", () => {
    const html = renderToStaticMarkup(
      <DetailsHeader title="nas-01" icon="plug" />,
    );
    expect(html).toContain('data-slot="mesh-details-header-icon"');
    expect(html).toMatch(/lucide-plug/);
  });

  it("renders the close affordance when onClose is provided", () => {
    const html = renderToStaticMarkup(
      <DetailsHeader title="nas-01" onClose={vi.fn()} />,
    );
    expect(html).toContain('data-slot="mesh-details-header-close"');
    expect(html).toMatch(/lucide-x/);
  });

  it("renders the actions slot", () => {
    const html = renderToStaticMarkup(
      <DetailsHeader
        title="nas-01"
        actions={<button type="button">Trace path</button>}
      />,
    );
    expect(html).toContain('data-slot="mesh-details-header-actions"');
    expect(html).toContain("Trace path");
  });
});
