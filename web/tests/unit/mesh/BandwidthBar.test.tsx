import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BandwidthBar } from "@/components/mesh/BandwidthBar";

describe("BandwidthBar", () => {
  it("renders separate rx and tx channels", () => {
    const html = renderToStaticMarkup(
      <BandwidthBar rx={250} tx={500} max={1000} width={100} />,
    );
    expect(html).toContain('data-channel="rx"');
    expect(html).toContain('data-channel="tx"');
  });

  it("scales bar widths against max", () => {
    const html = renderToStaticMarkup(
      <BandwidthBar rx={500} tx={250} max={1000} width={100} />,
    );
    // rx should be 50px, tx should be 25px (substring match)
    expect(html).toMatch(/width:\s*50px/);
    expect(html).toMatch(/width:\s*25px/);
  });

  it("clamps rx/tx to max so the bar never overflows", () => {
    const html = renderToStaticMarkup(
      <BandwidthBar rx={9000} tx={9000} max={1000} width={100} />,
    );
    expect(html).toMatch(/width:\s*100px/);
  });
});
