import { describe, it, expect } from "vitest";
import {
  ROUTER_TYPES,
  getDefaultRouterType,
} from "@/lib/router-config";

describe("ROUTER_TYPES", () => {
  it("has mikrotik as the first (default) entry", () => {
    expect(ROUTER_TYPES[0]).toBe("mikrotik");
  });

  it("contains mikrotik and pfsense", () => {
    expect(ROUTER_TYPES).toContain("mikrotik");
    expect(ROUTER_TYPES).toContain("pfsense");
    expect(ROUTER_TYPES).toHaveLength(2);
  });

  it("does not contain vyos", () => {
    expect(ROUTER_TYPES).not.toContain("vyos");
  });
});

describe("getDefaultRouterType", () => {
  it("returns mikrotik when mikrotik is enabled and default", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: true,
        pfsense_enabled: false,
        default_router: "mikrotik",
      }),
    ).toBe("mikrotik");
  });

  it("returns pfsense when pfsense is enabled and default", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: true,
        pfsense_enabled: true,
        default_router: "pfsense",
      }),
    ).toBe("pfsense");
  });

  it("returns mikrotik when pfsense is default but not enabled", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: true,
        pfsense_enabled: false,
        default_router: "pfsense",
      }),
    ).toBe("mikrotik");
  });

  it("returns mikrotik when settings is null (error fallback)", () => {
    expect(getDefaultRouterType(null)).toBe("mikrotik");
  });
});
