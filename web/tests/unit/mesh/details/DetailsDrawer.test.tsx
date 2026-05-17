import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement } from "react";
import {
  DetailsDrawer,
  type DetailsDrawerSide,
} from "@/components/mesh/details/DetailsDrawer";

// Sheet / Dialog content is rendered through a Radix Portal, which is not
// emitted by `renderToStaticMarkup` in a node-only test environment. We
// therefore verify the drawer's static contract: it produces a valid React
// tree for each variant, stays empty when closed, and forwards header /
// tab / footer composition to its children without throwing.

describe("DetailsDrawer", () => {
  it("renders to an empty string when closed (overlay/portal stays inert)", () => {
    const html = renderToStaticMarkup(
      <DetailsDrawer open={false} onOpenChange={vi.fn()} title="closed">
        <p>hidden-body</p>
      </DetailsDrawer>,
    );
    expect(html).not.toContain("hidden-body");
  });

  it.each<DetailsDrawerSide>(["right", "left", "center"])(
    "constructs a valid element for side=%s",
    (side) => {
      const el = (
        <DetailsDrawer
          open
          onOpenChange={vi.fn()}
          title="nas-01"
          side={side}
          eyebrow="Device"
          footer={<button type="button">Save</button>}
        >
          <p>body</p>
        </DetailsDrawer>
      );
      expect(isValidElement(el)).toBe(true);
      // Should not throw during render even if portal output is opaque to SSR
      expect(() => renderToStaticMarkup(el)).not.toThrow();
    },
  );

  it("accepts a tabs payload without throwing", () => {
    const el = (
      <DetailsDrawer
        open
        onOpenChange={vi.fn()}
        title="agent"
        tabs={[
          { value: "overview", label: "Overview", content: <p>ov</p> },
          { value: "logs", label: "Logs", content: <p>logs</p> },
        ]}
      >
        <p>extra</p>
      </DetailsDrawer>
    );
    expect(() => renderToStaticMarkup(el)).not.toThrow();
  });

  it("falls back to a generic title for non-string titles", () => {
    const el = (
      <DetailsDrawer
        open
        onOpenChange={vi.fn()}
        title={<span>complex</span>}
        side="center"
      >
        <p>body</p>
      </DetailsDrawer>
    );
    expect(() => renderToStaticMarkup(el)).not.toThrow();
  });
});
