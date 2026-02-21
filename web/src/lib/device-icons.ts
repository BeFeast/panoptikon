/**
 * Convenience wrapper around device-type inference.
 * Returns a Lucide icon component + human label for a device,
 * derived from vendor string and hostname.
 */

import type { LucideIcon } from "lucide-react";
import {
  CircuitBoard,
  Gamepad2,
  HelpCircle,
  Laptop,
  Monitor,
  Printer,
  Router,
  Server,
  Smartphone,
  Tablet,
  Tv,
} from "lucide-react";
import { inferDeviceType, type DeviceType } from "./device-type";

const ICON_MAP: Record<DeviceType, LucideIcon> = {
  router: Router,
  laptop: Laptop,
  desktop: Monitor,
  phone: Smartphone,
  tablet: Tablet,
  tv: Tv,
  server: Server,
  printer: Printer,
  iot: CircuitBoard,
  gaming: Gamepad2,
  unknown: HelpCircle,
};

const LABEL_MAP: Record<DeviceType, string> = {
  router: "Router",
  laptop: "Laptop",
  desktop: "Desktop",
  phone: "Phone",
  tablet: "Tablet",
  tv: "TV",
  server: "Server",
  printer: "Printer",
  iot: "IoT",
  gaming: "Gaming",
  unknown: "Device",
};

/**
 * Get device icon and label from vendor/hostname/mdns data.
 */
export function getDeviceIcon(
  vendor?: string | null,
  hostname?: string | null,
  mdnsServices?: string | null
): { icon: LucideIcon; label: string; type: DeviceType } {
  const type = inferDeviceType(vendor, hostname, mdnsServices);
  return {
    icon: ICON_MAP[type],
    label: LABEL_MAP[type],
    type,
  };
}
