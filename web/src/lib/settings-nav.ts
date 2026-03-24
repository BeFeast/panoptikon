/**
 * Settings navigation structure — defines which items appear in each section.
 * The "Advanced / Legacy" group gates power-user and deprecated integrations
 * away from the primary Integrations section so that new users see modern defaults.
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
        description: "Configure MikroTik router integration.",
      },
      {
        href: "/settings/xiaomi-mesh",
        title: "Xiaomi Mesh",
        description: "Configure Xiaomi mesh router integration.",
      },
      {
        href: "/settings/pfsense",
        title: "pfSense",
        description: "Configure pfSense router integration via SSH.",
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
        href: "/settings/email",
        title: "Email Notifications",
        description: "Configure SMTP for email alert delivery.",
      },
      {
        href: "/settings/snmp",
        title: "SNMP Management",
        description: "Configure SNMP scanning for managed routers.",
      },
      {
        href: "/settings/alert-rules",
        title: "Alert Rules",
        description:
          "Configure rules for device offline, bandwidth, and new devices.",
      },
      {
        href: "/settings/cloudflare-tunnel",
        title: "Cloudflare Tunnel",
        description: "Configure Cloudflare Tunnel API token and tunnel ID.",
      },
      {
        href: "/settings/openvpn",
        title: "OpenVPN",
        description: "Manage OpenVPN server, client accounts, and certificates.",
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
      {
        href: "/settings/dns-security",
        title: "DNS Security",
        description: "Configure DNS-over-TLS (DoT) and DNSSEC validation.",
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
          "View all configuration changes made via Panoptikon.",
      },
      {
        href: "/settings/config-backup",
        title: "Config Backup",
        description:
          "Download, snapshot, and restore router configurations.",
      },
      {
        href: "/settings/users",
        title: "User Management",
        description: "Manage users and role-based access control.",
      },
      {
        href: "/settings/password",
        title: "Change Password",
        description: "Update your login password.",
      },
    ],
  },
  {
    label: "Advanced / Legacy",
    subtitle: "Power-user settings and legacy integrations.",
    items: [
      {
        href: "/settings/advanced",
        title: "Advanced",
        description: "Toggle legacy router visibility and other advanced options.",
      },
    ],
  },
];
