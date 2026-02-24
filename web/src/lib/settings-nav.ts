/**
 * Settings navigation structure — defines which items appear in each section.
 * The "Legacy / Optional" group gates deprecated integrations away from
 * the primary Integrations section so that new users see modern defaults.
 */

export interface SettingsNavItem {
  href: string;
  title: string;
  description: string;
}

export interface SettingsNavGroup {
  label: string;
  subtitle?: string;
  items: SettingsNavItem[];
}

export const settingsNav: SettingsNavGroup[] = [
  {
    label: "Integrations",
    items: [
      {
        href: "/settings/router",
        title: "Router",
        description: "Configure MikroTik or VyOS router integration.",
      },
      {
        href: "/settings/xiaomi-mesh",
        title: "Xiaomi Mesh",
        description: "Configure Xiaomi mesh router integration.",
      },
      {
        href: "/settings/caddy",
        title: "Caddy Reverse Proxy",
        description: "Primary reverse proxy — manage hosts via Caddy.",
      },
      {
        href: "/settings/dns",
        title: "Unbound DNS",
        description: "Manage local DNS A records via Unbound.",
      },
      {
        href: "/settings/tailscale",
        title: "Tailscale",
        description: "Secure remote access via WireGuard mesh VPN.",
      },
      {
        href: "/settings/webhook",
        title: "Webhook Notifications",
        description: "POST alerts to Discord, Slack, ntfy.sh, or any URL.",
      },
      {
        href: "/settings/alert-rules",
        title: "Alert Rules",
        description:
          "Configure rules for device offline, bandwidth, and new devices.",
      },
    ],
  },
  {
    label: "Network",
    items: [
      {
        href: "/settings/scanner",
        title: "Network Scanner",
        description: "Configure ARP scanning, subnets, and ping sweep.",
      },
      {
        href: "/settings/speedtest",
        title: "Speed Test",
        description: "Configure automatic speed tests and retention.",
      },
      {
        href: "/settings/dns-blocklists",
        title: "DNS Blocklists",
        description: "Block ads and trackers via DNS blocklists.",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/settings/retention",
        title: "Data Retention",
        description: "Configure data retention and manage database size.",
      },
      {
        href: "/settings/audit-log",
        title: "Audit Log",
        description:
          "View all VyOS configuration changes made via Panoptikon.",
      },
      {
        href: "/settings/config-backup",
        title: "Config Backup",
        description:
          "Download, snapshot, and restore VyOS router configurations.",
      },
      {
        href: "/settings/password",
        title: "Change Password",
        description: "Update your login password.",
      },
    ],
  },
  {
    label: "Legacy / Optional",
    subtitle: "Use Caddy for new deployments.",
    items: [
      {
        href: "/settings/npm",
        title: "Nginx Proxy Manager",
        description: "Legacy reverse proxy — consider migrating to Caddy.",
      },
    ],
  },
];
