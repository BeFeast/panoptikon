import { describe, it, expect } from "vitest";
import { settingsNav } from "@/lib/settings-nav";

describe("settingsNav visibility gating", () => {
  const legacyGroup = settingsNav.find((g) => g.label === "Advanced / Legacy");
  const integrationsGroup = settingsNav.find(
    (g) => g.label === "Integrations",
  );

  it("has an 'Advanced / Legacy' section", () => {
    expect(legacyGroup).toBeDefined();
  });

  it("legacy section does not contain NPM (replaced by Caddy)", () => {
    const npmItem = legacyGroup!.items.find(
      (i) => i.href === "/settings/npm",
    );
    expect(npmItem).toBeUndefined();
  });

  it("legacy section has a subtitle describing legacy integrations", () => {
    expect(legacyGroup!.subtitle).toMatch(/legacy integrations/i);
  });

  it("Cloudflare Tunnel is in the primary Integrations section", () => {
    const cfItem = integrationsGroup!.items.find(
      (i) => i.href === "/settings/cloudflare-tunnel",
    );
    expect(cfItem).toBeDefined();
    expect(cfItem!.title).toBe("Cloudflare Tunnel");
  });

  it("MikroTik and pfSense integrations are in the primary Integrations section", () => {
    const mikrotikItem = integrationsGroup!.items.find(
      (i) => i.href === "/settings/router",
    );
    const pfsenseItem = integrationsGroup!.items.find(
      (i) => i.href === "/settings/pfsense",
    );
    expect(mikrotikItem).toBeDefined();
    expect(mikrotikItem!.title).toBe("MikroTik");
    expect(mikrotikItem!.description).toMatch(/MikroTik/);
    expect(pfsenseItem).toBeDefined();
    expect(pfsenseItem!.title).toBe("pfSense");
  });

  it("VyOS does not appear anywhere in settings nav", () => {
    const allItems = settingsNav.flatMap((g) => g.items);
    const vyosInTitle = allItems.find(
      (i) => i.title.toLowerCase().includes("vyos"),
    );
    expect(vyosInTitle).toBeUndefined();

    const vyosInDescription = allItems.find(
      (i) => i.description.toLowerCase().includes("vyos"),
    );
    expect(vyosInDescription).toBeUndefined();
  });
});
