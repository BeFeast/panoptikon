import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KPI } from "@/components/mesh/KPI";
import { Spark } from "@/components/mesh/Spark";

describe("KPI", () => {
  it("renders label, value and unit", () => {
    const html = renderToStaticMarkup(
      <KPI label="Bandwidth" value="420" unit="Mbps" />,
    );
    expect(html).toContain("Bandwidth");
    expect(html).toContain("420");
    expect(html).toContain("Mbps");
  });

  it("colours a positive trend chip green and exposes data-trend", () => {
    const html = renderToStaticMarkup(
      <KPI label="Latency" value="42" unit="ms" trend="+5%" />,
    );
    expect(html).toContain('data-trend="up"');
    expect(html).toContain("status-online");
    expect(html).toContain("+5%");
  });

  it("colours a negative trend chip red and exposes data-trend", () => {
    const html = renderToStaticMarkup(
      <KPI label="Errors" value="3" trend="-1" />,
    );
    expect(html).toContain('data-trend="down"');
    expect(html).toContain("status-offline");
  });

  it("renders an embedded spark when supplied", () => {
    const html = renderToStaticMarkup(
      <KPI
        label="Trend"
        value="100"
        spark={<Spark data={[1, 2, 3, 4]} />}
      />,
    );
    expect(html).toContain("<svg");
  });
});
