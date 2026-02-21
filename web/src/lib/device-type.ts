/**
 * Device type inference from vendor, hostname, and mDNS services.
 * Maps devices to recognizable categories for icon display.
 */

export type DeviceType =
  | "router"
  | "laptop"
  | "desktop"
  | "phone"
  | "tablet"
  | "tv"
  | "server"
  | "printer"
  | "iot"
  | "gaming"
  | "unknown";

// Vendor patterns → device type
const VENDOR_PATTERNS: Array<[RegExp, DeviceType]> = [
  // Phones
  [/apple/i, "phone"], // overridden by hostname check
  [/samsung/i, "phone"],
  [/oneplus/i, "phone"],
  [/xiaomi/i, "phone"],
  [/huawei/i, "phone"],
  [/google/i, "phone"], // Pixel devices, overridden by hostname
  [/motorola/i, "phone"],
  [/oppo/i, "phone"],
  [/vivo(?!\s*tek)/i, "phone"],
  [/realme/i, "phone"],
  [/honor/i, "phone"],

  // Networking
  [/ubiquiti|unifi/i, "router"],
  [/mikrotik/i, "router"],
  [/netgear/i, "router"],
  [/tp-link|tplink/i, "router"],
  [/cisco/i, "router"],
  [/juniper/i, "router"],
  [/aruba/i, "router"],
  [/vyatta|vyos/i, "router"],
  [/fortinet|fortigate/i, "router"],
  [/draytek/i, "router"],
  [/zyxel/i, "router"],

  // TVs & streaming
  [/samsung.*tv|lg.*tv/i, "tv"],
  [/roku/i, "tv"],
  [/amazon|fire\s*tv/i, "tv"],
  [/apple\s*tv/i, "tv"],
  [/chromecast/i, "tv"],
  [/nvidia.*shield/i, "tv"],
  [/vizio/i, "tv"],
  [/tcl/i, "tv"],
  [/hisense/i, "tv"],
  [/sony.*bravia/i, "tv"],

  // IoT
  [/sonos/i, "iot"],
  [/philips.*hue/i, "iot"],
  [/nest/i, "iot"],
  [/ring/i, "iot"],
  [/ecobee/i, "iot"],
  [/espressif|esp32|esp8266/i, "iot"],
  [/tuya/i, "iot"],
  [/shelly/i, "iot"],
  [/ikea/i, "iot"],
  [/zigbee|z-wave/i, "iot"],
  [/tasmota/i, "iot"],
  [/home\s*assistant/i, "iot"],

  // Printers
  [/hp\s*inc|hewlett.*packard/i, "printer"],
  [/canon/i, "printer"],
  [/epson/i, "printer"],
  [/brother/i, "printer"],
  [/xerox/i, "printer"],
  [/lexmark/i, "printer"],

  // Servers / NAS
  [/synology/i, "server"],
  [/qnap/i, "server"],
  [/dell.*server|dell.*power/i, "server"],
  [/supermicro/i, "server"],
  [/truenas|freenas|ixsystems/i, "server"],
  [/asustor/i, "server"],

  // Gaming
  [/nintendo/i, "gaming"],
  [/sony.*playstation|ps[45]/i, "gaming"],
  [/microsoft.*xbox/i, "gaming"],
  [/valve.*steam/i, "gaming"],

  // Computers (broad matches, should come late)
  [/dell/i, "laptop"],
  [/lenovo/i, "laptop"],
  [/asus/i, "laptop"],
  [/acer/i, "laptop"],
  [/intel/i, "desktop"],
];

// Hostname patterns → device type
const HOSTNAME_PATTERNS: Array<[RegExp, DeviceType]> = [
  // Apple devices from hostname
  [/macbook|mbp/i, "laptop"],
  [/imac/i, "desktop"],
  [/iphone/i, "phone"],
  [/ipad/i, "tablet"],
  [/apple-?tv/i, "tv"],
  [/homepod/i, "iot"],

  // Android devices
  [/android|galaxy|pixel|oneplus|xiaomi/i, "phone"],

  // Common server names
  [/server|nas|pve|proxmox|truenas|docker|k8s|kube/i, "server"],
  [/pi-?hole|pihole|home-?assistant|hass/i, "server"],

  // Gaming
  [/playstation|ps[45]|xbox|switch|nintendo/i, "gaming"],

  // Printers
  [/printer|laserjet|deskjet|officejet/i, "printer"],

  // Router
  [/router|gateway|firewall|switch|ap-|unifi|ubnt/i, "router"],

  // Generic computers
  [/desktop|workstation|pc-/i, "desktop"],
  [/laptop|notebook/i, "laptop"],

  // TV
  [/tv|roku|firestick|chromecast|smarttv/i, "tv"],
];

// mDNS service patterns
const MDNS_PATTERNS: Array<[RegExp, DeviceType]> = [
  [/_printer\._|_ipp\._|_pdl-datastream\._/i, "printer"],
  [/_airplay\._|_raop\._/i, "tv"],
  [/_googlecast\._/i, "tv"],
  [/_sonos\._|_spotify-connect\._/i, "iot"],
  [/_ssh\._|_sftp-ssh\._|_smb\._|_nfs\._/i, "server"],
  [/_http\._|_https\._/i, "server"],
];

/**
 * Infer device type from available device data.
 * Priority: hostname > vendor > mDNS > unknown
 */
export function inferDeviceType(
  vendor: string | null | undefined,
  hostname: string | null | undefined,
  mdnsServices: string | null | undefined
): DeviceType {
  // 1. Check hostname first (most specific)
  if (hostname) {
    for (const [pattern, type] of HOSTNAME_PATTERNS) {
      if (pattern.test(hostname)) return type;
    }
  }

  // 2. Check vendor
  if (vendor) {
    for (const [pattern, type] of VENDOR_PATTERNS) {
      if (pattern.test(vendor)) return type;
    }
  }

  // 3. Check mDNS services
  if (mdnsServices) {
    for (const [pattern, type] of MDNS_PATTERNS) {
      if (pattern.test(mdnsServices)) return type;
    }
  }

  return "unknown";
}
