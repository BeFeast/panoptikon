import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailsSection } from "@/components/mesh/details/DetailsSection";

describe("DetailsSection", () => {
  it("renders a card with a title and body", () => {
    const html = renderToStaticMarkup(
      <DetailsSection title="Traffic">
        <p>chart</p>
      </DetailsSection>,
    );
    expect(html).toContain('data-component="mesh-details-section"');
    expect(html).toContain('data-variant="card"');
    expect(html).toContain("Traffic");
    expect(html).toContain("chart");
  });

  it("renders an action slot and subtitle", () => {
    const html = renderToStaticMarkup(
      <DetailsSection
        title="Recent"
        subtitle="last 24h"
        action={<button type="button">All</button>}
      >
        <p>rows</p>
      </DetailsSection>,
    );
    expect(html).toContain('data-slot="mesh-details-section-action"');
    expect(html).toContain("last 24h");
    expect(html).toContain("All");
  });

  it("renders bare variant without card chrome", () => {
    const html = renderToStaticMarkup(
      <DetailsSection title="bare" card={false}>
        <p>body</p>
      </DetailsSection>,
    );
    expect(html).toContain('data-variant="bare"');
  });

  it("renders an icon when an icon name is supplied", () => {
    const html = renderToStaticMarkup(
      <DetailsSection title="Ports" icon="ethernet">
        <p>x</p>
      </DetailsSection>,
    );
    expect(html).toMatch(/lucide-cable/);
  });
});
