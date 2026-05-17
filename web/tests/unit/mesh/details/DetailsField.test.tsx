import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailsField } from "@/components/mesh/details/DetailsField";

describe("DetailsField", () => {
  it("renders label and value", () => {
    const html = renderToStaticMarkup(
      <DetailsField label="endpoint" value="wss://core.lan/agent" />,
    );
    expect(html).toContain("endpoint");
    expect(html).toContain("wss://core.lan/agent");
    expect(html).toContain('data-component="mesh-details-field"');
    expect(html).toContain('data-orientation="horizontal"');
  });

  it("supports the vertical orientation", () => {
    const html = renderToStaticMarkup(
      <DetailsField label="session" value="8a4f-3c92" vertical />,
    );
    expect(html).toContain('data-orientation="vertical"');
  });

  it("respects mono=false for sans value rendering", () => {
    const html = renderToStaticMarkup(
      <DetailsField label="hint" value="text" mono={false} />,
    );
    // Sans font stack should be applied to the value slot
    expect(html).toMatch(/data-slot="mesh-details-field-value"[^>]*font-sans/);
  });

  it("applies a custom value colour when supplied", () => {
    const html = renderToStaticMarkup(
      <DetailsField label="retries" value="3 / 5" valueColor="#f59e0b" />,
    );
    expect(html).toContain("#f59e0b");
  });
});
