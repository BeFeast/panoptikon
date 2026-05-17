import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Trend } from "@/components/mesh/Trend";

describe("Trend", () => {
  it("renders an up arrow for positive=true (default)", () => {
    const html = renderToStaticMarkup(<Trend value="+12%" />);
    expect(html).toContain('data-direction="up"');
    expect(html).toContain("+12%");
    expect(html).toContain("status-online");
  });

  it("renders a down arrow for positive=false", () => {
    const html = renderToStaticMarkup(<Trend value="-3.4 ms" positive={false} />);
    expect(html).toContain('data-direction="down"');
    expect(html).toContain("-3.4 ms");
    expect(html).toContain("status-offline");
  });
});
