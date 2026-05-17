import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailsFooter } from "@/components/mesh/details/DetailsFooter";

describe("DetailsFooter", () => {
  it("renders children right-aligned by default", () => {
    const html = renderToStaticMarkup(
      <DetailsFooter>
        <button type="button">Save</button>
      </DetailsFooter>,
    );
    expect(html).toContain('data-component="mesh-details-footer"');
    expect(html).toContain("Save");
    expect(html).toContain("justify-content:flex-end");
  });

  it("supports the centered alignment", () => {
    const html = renderToStaticMarkup(
      <DetailsFooter align="center">
        <button type="button">OK</button>
      </DetailsFooter>,
    );
    expect(html).toContain("justify-content:center");
  });

  it("supports the start alignment", () => {
    const html = renderToStaticMarkup(
      <DetailsFooter align="start">
        <button type="button">Back</button>
      </DetailsFooter>,
    );
    expect(html).toContain("justify-content:flex-start");
  });
});
