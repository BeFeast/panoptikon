import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailsTabs } from "@/components/mesh/details/DetailsTabs";

describe("DetailsTabs", () => {
  it("renders nothing for an empty list", () => {
    const html = renderToStaticMarkup(<DetailsTabs items={[]} />);
    expect(html).toBe("");
  });

  it("renders each tab label and the body of the default tab", () => {
    const html = renderToStaticMarkup(
      <DetailsTabs
        items={[
          { value: "overview", label: "Overview", content: <p>OV</p> },
          { value: "traffic", label: "Traffic", content: <p>TR</p> },
        ]}
      />,
    );
    expect(html).toContain("Overview");
    expect(html).toContain("Traffic");
    expect(html).toContain('data-component="mesh-details-tabs"');
    // Default-active body is rendered
    expect(html).toContain("OV");
  });

  it("renders an optional badge chip after a tab label", () => {
    const html = renderToStaticMarkup(
      <DetailsTabs
        items={[
          { value: "alerts", label: "Alerts", badge: 2 },
        ]}
      />,
    );
    expect(html).toContain('data-slot="mesh-details-tab-badge"');
    expect(html).toContain(">2<");
  });

  it("renders a trailing slot for filter chips", () => {
    const html = renderToStaticMarkup(
      <DetailsTabs
        items={[{ value: "a", label: "A" }]}
        trailing={<span>filter</span>}
      />,
    );
    expect(html).toContain('data-slot="mesh-details-tabs-trailing"');
    expect(html).toContain("filter");
  });
});
