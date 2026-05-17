import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MiniBars } from "@/components/mesh/MiniBars";

describe("MiniBars", () => {
  it("renders one rect per data point", () => {
    const html = renderToStaticMarkup(<MiniBars data={[1, 2, 3, 4]} />);
    const rects = html.match(/<rect/g) ?? [];
    expect(rects.length).toBe(4);
  });

  it("returns null for empty data", () => {
    const html = renderToStaticMarkup(<MiniBars data={[]} />);
    expect(html).toBe("");
  });

  it("uses the supplied colour", () => {
    const html = renderToStaticMarkup(
      <MiniBars data={[1, 2]} color="#22d3ee" />,
    );
    expect(html).toContain("#22d3ee");
  });
});
