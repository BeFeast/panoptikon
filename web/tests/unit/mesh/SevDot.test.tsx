import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SevDot } from "@/components/mesh/SevDot";

describe("SevDot", () => {
  it("defaults to severity=info", () => {
    const html = renderToStaticMarkup(<SevDot />);
    expect(html).toContain('data-severity="info"');
  });

  it.each(["critical", "high", "medium", "low", "info"] as const)(
    "exposes data-severity=%s",
    (severity) => {
      const html = renderToStaticMarkup(<SevDot severity={severity} />);
      expect(html).toContain(`data-severity="${severity}"`);
    },
  );

  it("adds a halo for critical only", () => {
    const critical = renderToStaticMarkup(<SevDot severity="critical" />);
    const low = renderToStaticMarkup(<SevDot severity="low" />);
    expect(critical).toContain("box-shadow");
    expect(critical).toContain("244, 63, 94");
    expect(low).not.toContain("244, 63, 94");
  });
});
