import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Spark } from "@/components/mesh/Spark";

describe("Spark", () => {
  it("returns null for empty data", () => {
    const html = renderToStaticMarkup(<Spark data={[]} />);
    expect(html).toBe("");
  });

  it("renders an svg with a stroked path and end-point circle", () => {
    const html = renderToStaticMarkup(<Spark data={[1, 4, 2, 5, 3]} />);
    expect(html).toContain("<svg");
    // line path
    expect(html).toMatch(/<path[^>]+stroke=/);
    // end-point dot
    expect(html).toContain("<circle");
    // gradient defined for fill
    expect(html).toContain("linearGradient");
  });

  it("respects custom color and disables fill when requested", () => {
    const html = renderToStaticMarkup(
      <Spark data={[1, 2, 3]} color="#ff0066" fill={false} />,
    );
    expect(html).toContain("#ff0066");
    // when fill is false the gradient-fill path is omitted, only the line path
    const pathCount = (html.match(/<path/g) ?? []).length;
    expect(pathCount).toBe(1);
  });
});
