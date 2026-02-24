import { describe, expect, it, vi } from "vitest";
import type { Asset } from "@/lib/types";
import { loadAssetsWithDeviceSync } from "@/lib/assets";

function buildAsset(id: string): Asset {
  return {
    id,
    name: `asset-${id}`,
    asset_type: "unknown",
    status: "active",
    location: null,
    owner: null,
    tags: null,
    notes: null,
    purchase_date: null,
    serial_number: null,
    device_id: null,
    agent_id: null,
    ssh_target_id: null,
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
    ip: null,
    mac: null,
    device_online: null,
    device_last_seen: null,
    agent_name: null,
    agent_os: null,
    agent_online: null,
    ssh_name: null,
    ssh_os: null,
    ssh_online: null,
  };
}

describe("loadAssetsWithDeviceSync", () => {
  it("returns existing assets without running sync", async () => {
    const existing = [buildAsset("a1")];
    const fetchAssets = vi.fn().mockResolvedValue(existing);
    const syncAssetsFromDevices = vi.fn();

    const result = await loadAssetsWithDeviceSync({
      fetchAssets,
      syncAssetsFromDevices,
    });

    expect(result).toEqual(existing);
    expect(fetchAssets).toHaveBeenCalledTimes(1);
    expect(syncAssetsFromDevices).not.toHaveBeenCalled();
  });

  it("syncs discovered devices when assets are empty, then reloads", async () => {
    const afterSync = [buildAsset("a1"), buildAsset("a2")];
    const fetchAssets = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(afterSync);
    const syncAssetsFromDevices = vi.fn().mockResolvedValue({
      created: 2,
      skipped: 0,
      details: [],
    });

    const result = await loadAssetsWithDeviceSync({
      fetchAssets,
      syncAssetsFromDevices,
    });

    expect(result).toEqual(afterSync);
    expect(fetchAssets).toHaveBeenCalledTimes(2);
    expect(syncAssetsFromDevices).toHaveBeenCalledTimes(1);
  });

  it("keeps empty list when no assets and no devices were synced", async () => {
    const fetchAssets = vi.fn().mockResolvedValue([]);
    const syncAssetsFromDevices = vi.fn().mockResolvedValue({
      created: 0,
      skipped: 0,
      details: [],
    });

    const result = await loadAssetsWithDeviceSync({
      fetchAssets,
      syncAssetsFromDevices,
    });

    expect(result).toEqual([]);
    expect(fetchAssets).toHaveBeenCalledTimes(1);
    expect(syncAssetsFromDevices).toHaveBeenCalledTimes(1);
  });
});
