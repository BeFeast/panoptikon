import type { Asset, AssetSyncFromDevicesResponse } from "./types";

interface LoadAssetsWithDeviceSyncDeps {
  fetchAssets: () => Promise<Asset[]>;
  syncAssetsFromDevices: () => Promise<AssetSyncFromDevicesResponse>;
}

/**
 * Ensure discovered devices are surfaced on Assets by running a sync pass when
 * the inventory is empty, then reloading assets.
 */
export async function loadAssetsWithDeviceSync(
  deps: LoadAssetsWithDeviceSyncDeps
): Promise<Asset[]> {
  const assets = await deps.fetchAssets();
  if (assets.length > 0) {
    return assets;
  }

  const sync = await deps.syncAssetsFromDevices();
  if (sync.created <= 0) {
    return assets;
  }

  return deps.fetchAssets();
}
