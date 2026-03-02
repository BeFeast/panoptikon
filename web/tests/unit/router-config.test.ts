import { describe, it, expect } from "vitest";
import {
  ROUTER_TYPES,
  getDefaultRouterType,
} from "@/lib/router-config";

describe("ROUTER_TYPES", () => {
  it("has mikrotik as the first (default) entry", () => {
    expect(ROUTER_TYPES[0]).toBe("mikrotik");
  });

  it("contains only mikrotik", () => {
    expect(ROUTER_TYPES).toContain("mikrotik");
    expect(ROUTER_TYPES).toHaveLength(1);
  });

  it("does not contain vyos", () => {
    expect(ROUTER_TYPES).not.toContain("vyos");
  });
});

describe("getDefaultRouterType", () => {
  it("returns mikrotik when mikrotik is enabled", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: true,
      }),
    ).toBe("mikrotik");
  });

  it("returns mikrotik when mikrotik is disabled", () => {
    expect(
      getDefaultRouterType({
        mikrotik_enabled: false,
      }),
    ).toBe("mikrotik");
  });

  it("returns mikrotik when settings is null (error fallback)", () => {
    expect(getDefaultRouterType(null)).toBe("mikrotik");
  });
});
