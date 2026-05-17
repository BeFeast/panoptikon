import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusDot } from "@/components/mesh/StatusDot";

describe("StatusDot", () => {
  it("defaults to status=online without pulse", () => {
    const html = renderToStaticMarkup(<StatusDot />);
    expect(html).toContain('data-status="online"');
    expect(html).toContain('data-pulse="false"');
  });

  it("renders pulse=true when requested and sets glow-pulse animation", () => {
    const html = renderToStaticMarkup(<StatusDot status="online" pulse />);
    expect(html).toContain('data-pulse="true"');
    expect(html).toContain("glow-pulse");
  });

  it.each(["online", "offline", "warning", "info", "inactive"] as const)(
    "exposes data-status=%s",
    (status) => {
      const html = renderToStaticMarkup(<StatusDot status={status} />);
      expect(html).toContain(`data-status="${status}"`);
    },
  );
});
