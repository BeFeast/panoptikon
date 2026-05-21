import { describe, expect, it } from "vitest";
import {
  isPlaceholderMeshLabel,
  meshLeafLabel,
  meshNodeLabel,
} from "@/lib/mesh-labels";
import type { XiaomiTopoLeaf, XiaomiTopoNode } from "@/lib/types";

const baseNode: XiaomiTopoNode = {
  mac: "AA:BB:CC:00:00:01",
  name: null,
  locale: null,
  ip: "10.10.0.199",
  online: 0,
  hardware: null,
  model: null,
};

const baseLeaf: XiaomiTopoLeaf = {
  mac: "DE:AD:BE:EF:00:01",
  ip: "10.10.0.100",
  name: null,
  online: 1,
  parent_id: "AA:BB:CC:00:00:01",
};

describe("mesh label resolution (#807)", () => {
  describe("isPlaceholderMeshLabel", () => {
    it.each([
      [null],
      [undefined],
      [""],
      ["default"],
      ["DEFAULT"],
      ["  Default  "],
      ["node"],
      ["router"],
      ["mesh"],
      ["unknown"],
    ])("treats %p as a placeholder", (value) => {
      expect(isPlaceholderMeshLabel(value)).toBe(true);
    });

    it.each([["Live Studio"], ["Basement"], ["Floor 2"], ["master"], ["slave"]])(
      "treats %p as a real label",
      (value) => {
        expect(isPlaceholderMeshLabel(value)).toBe(false);
      },
    );
  });

  describe("meshNodeLabel", () => {
    it("prefers the real name over a `default` locale (#807 regression)", () => {
      // BE3600 firmware sends locale=default for unlabelled satellites.
      // The old code chose locale first and collapsed every node to "default".
      expect(
        meshNodeLabel({ ...baseNode, name: "Live Studio", locale: "default" }),
      ).toBe("Live Studio");
      expect(
        meshNodeLabel({ ...baseNode, name: "Basement", locale: "default" }),
      ).toBe("Basement");
      expect(
        meshNodeLabel({ ...baseNode, name: "Floor 2", locale: "default" }),
      ).toBe("Floor 2");
    });

    it("falls back to locale when name is a placeholder", () => {
      expect(
        meshNodeLabel({ ...baseNode, name: null, locale: "master" }),
      ).toBe("master");
      expect(
        meshNodeLabel({ ...baseNode, name: "default", locale: "OK Home" }),
      ).toBe("OK Home");
    });

    it("falls back to ip then mac when both labels are placeholders", () => {
      expect(
        meshNodeLabel({
          ...baseNode,
          name: "default",
          locale: "default",
          ip: "10.10.0.199",
        }),
      ).toBe("10.10.0.199");

      expect(
        meshNodeLabel({
          ...baseNode,
          name: "default",
          locale: "default",
          ip: null,
        }),
      ).toBe("AA:BB:CC:00:00:01");
    });

    it("returns the generic 'Mesh Node' fallback when no identifier is present", () => {
      expect(
        meshNodeLabel({
          ...baseNode,
          name: "default",
          locale: "default",
          ip: null,
          mac: null,
        }),
      ).toBe("Mesh Node");
    });
  });

  describe("meshLeafLabel", () => {
    it("uses the real device name when present", () => {
      expect(meshLeafLabel({ ...baseLeaf, name: "iPhone" })).toBe("iPhone");
    });

    it("filters placeholder names and falls back to ip / mac", () => {
      expect(
        meshLeafLabel({ ...baseLeaf, name: "default", ip: "10.10.0.100" }),
      ).toBe("10.10.0.100");
      expect(
        meshLeafLabel({ ...baseLeaf, name: "default", ip: null }),
      ).toBe("DE:AD:BE:EF:00:01");
    });
  });
});
