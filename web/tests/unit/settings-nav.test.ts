import { describe, it, expect } from "vitest";
import { settingsNav } from "@/lib/settings-nav";

describe("settingsNav visibility gating", () => {
  const legacyGroup = settingsNav.find((g) => g.label === "Legacy / Optional");
  const integrationsGroup = settingsNav.find(
    (g) => g.label === "Integrations",
  );

  it("has a 'Legacy / Optional' section", () => {
    expect(legacyGroup).toBeDefined();
  });

  it("legacy section contains NPM (Nginx Proxy Manager)", () => {
    const npmItem = legacyGroup!.items.find(
      (i) => i.href === "/settings/npm",
    );
    expect(npmItem).toBeDefined();
    expect(npmItem!.title).toBe("Nginx Proxy Manager");
  });

  it("legacy section has a subtitle guiding users toward Caddy", () => {
    expect(legacyGroup!.subtitle).toMatch(/caddy/i);
  });

  it("NPM is NOT in the primary Integrations section", () => {
    const npmInIntegrations = integrationsGroup!.items.find(
      (i) => i.href === "/settings/npm",
    );
    expect(npmInIntegrations).toBeUndefined();
  });

  it("Router integration is in the primary Integrations section", () => {
    const routerItem = integrationsGroup!.items.find(
      (i) => i.href === "/settings/router",
    );
    expect(routerItem).toBeDefined();
    expect(routerItem!.title).toBe("Router");
    expect(routerItem!.description).toMatch(/MikroTik/);
  });

  it("VyOS appears only in the Router integration description", () => {
    // VyOS should be mentioned in the router settings description
    // but should NOT have its own top-level settings card
    const routerItem = integrationsGroup!.items.find(
      (i) => i.href === "/settings/router",
    );
    expect(routerItem!.description).toMatch(/VyOS/);

    // No standalone VyOS settings item anywhere
    const allItems = settingsNav.flatMap((g) => g.items);
    const vyosOnlyItem = allItems.find(
      (i) => i.title.toLowerCase() === "vyos",
    );
    expect(vyosOnlyItem).toBeUndefined();
  });
});
