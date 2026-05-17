import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Icon, ICON_MAP, type IconName } from "@/components/mesh/Icon";

describe("Icon", () => {
  it("renders an svg for a known name", () => {
    const html = renderToStaticMarkup(<Icon name="dashboard" />);
    expect(html).toContain("<svg");
  });

  it("applies the supplied size", () => {
    const html = renderToStaticMarkup(<Icon name="alert" size={32} />);
    expect(html).toMatch(/width="32"/);
    expect(html).toMatch(/height="32"/);
  });

  it("covers every name required by the design handoff", () => {
    const required: IconName[] = [
      "dashboard",
      "alert",
      "log",
      "device",
      "tag",
      "mesh",
      "qos",
      "nat",
      "router",
      "dns",
      "globe",
      "cert",
      "caddy",
      "tunnel",
      "service",
      "agent",
      "search",
      "chevron-right",
      "chevron-down",
      "refresh",
      "bell",
      "settings",
      "filter",
      "plus",
      "cmd",
    ];
    for (const name of required) {
      expect(ICON_MAP[name], `missing icon: ${name}`).toBeDefined();
    }
  });
});
