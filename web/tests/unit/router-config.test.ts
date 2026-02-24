import { describe, it, expect } from "vitest";
import {
  ROUTER_TYPES,
  getDefaultRouterType,
} from "@/lib/router-config";

describe("ROUTER_TYPES", () => {
  it("has mikrotik as the first (default) entry", () => {
    expect(ROUTER_TYPES[0]).toBe("mikrotik");
  });

  it("contains both mikrotik and vyos", () => {
    expect(ROUTER_TYPES).toContain("mikrotik");
    expect(ROUTER_TYPES).toContain("vyos");
  });

  it("lists mikrotik before vyos", () => {
    const mikrotikIdx = ROUTER_TYPES.indexOf("mikrotik");
    const vyosIdx = ROUTER_TYPES.indexOf("vyos");
    expect(mikrotikIdx).toBeLessThan(vyosIdx);
  });
});

describe("getDefaultRouterType", () => {
  it("returns mikrotik when mikrotik is enabled", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: true,
        vyos_url: null,
        vyos_api_key_set: false,
        show_legacy_routers: false,
      }),
    ).toBe("mikrotik");
  });

  it("returns mikrotik when both mikrotik and vyos are configured", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: true,
        vyos_url: "https://vyos.local",
        vyos_api_key_set: true,
        show_legacy_routers: true,
      }),
    ).toBe("mikrotik");
  });

  it("returns vyos when only vyos is configured and legacy routers are enabled", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: false,
        vyos_url: "https://vyos.local",
        vyos_api_key_set: true,
        show_legacy_routers: true,
      }),
    ).toBe("vyos");
  });

  it("returns mikrotik when vyos is configured but legacy routers are disabled", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: false,
        vyos_url: "https://vyos.local",
        vyos_api_key_set: true,
        show_legacy_routers: false,
      }),
    ).toBe("mikrotik");
  });

  it("returns mikrotik when vyos_url is set but api key is not", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: false,
        vyos_url: "https://vyos.local",
        vyos_api_key_set: false,
        show_legacy_routers: true,
      }),
    ).toBe("mikrotik");
  });

  it("returns mikrotik when nothing is configured", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: false,
        vyos_url: null,
        vyos_api_key_set: false,
        show_legacy_routers: false,
      }),
    ).toBe("mikrotik");
  });

  it("returns mikrotik when settings is null (error fallback)", () => {
    expect(getDefaultRouterType(null)).toBe("mikrotik");
  });
});
