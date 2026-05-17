"use client";

import { useEffect, useRef, useState } from "react";
import {
  Radar,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Search,
  Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function ScannerSettingsPage() {
  const [scanInterval, setScanInterval] = useState("60");
  const [savedScanInterval, setSavedScanInterval] = useState("60");
  const [scanSubnets, setScanSubnets] = useState("");
  const [savedScanSubnets, setSavedScanSubnets] = useState("");
  const [pingSweepEnabled, setPingSweepEnabled] = useState(true);
  const [savedPingSweepEnabled, setSavedPingSweepEnabled] = useState(true);
  const [nmapEnabled, setNmapEnabled] = useState(false);
  const [savedNmapEnabled, setSavedNmapEnabled] = useState(false);
  const [netbiosEnabled, setNetbiosEnabled] = useState(false);
  const [savedNetbiosEnabled, setSavedNetbiosEnabled] = useState(false);
  const [snmpEnabled, setSnmpEnabled] = useState(false);
  const [savedSnmpEnabled, setSavedSnmpEnabled] = useState(false);
  const [httpFingerprintEnabled, setHttpFingerprintEnabled] = useState(false);
  const [savedHttpFingerprintEnabled, setSavedHttpFingerprintEnabled] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<Status>("idle");
  const [scannerMsg, setScannerMsg] = useState("");

  const settingsLoadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          scan_interval_seconds: number | null;
          scan_subnets: string | null;
          ping_sweep_enabled: boolean | null;
          nmap_scan_enabled: boolean | null;
          netbios_scan_enabled: boolean | null;
          snmp_scan_enabled: boolean | null;
          http_fingerprint_enabled: boolean | null;
        }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          const interval = String(data.scan_interval_seconds ?? 60);
          setScanInterval(interval);
          setSavedScanInterval(interval);
          const subnets = data.scan_subnets ?? "";
          setScanSubnets(subnets);
          setSavedScanSubnets(subnets);
          const ping = data.ping_sweep_enabled ?? true;
          setPingSweepEnabled(ping);
          setSavedPingSweepEnabled(ping);
          const nmap = data.nmap_scan_enabled ?? false;
          setNmapEnabled(nmap);
          setSavedNmapEnabled(nmap);
          const netbios = data.netbios_scan_enabled ?? false;
          setNetbiosEnabled(netbios);
          setSavedNetbiosEnabled(netbios);
          const snmp = data.snmp_scan_enabled ?? false;
          setSnmpEnabled(snmp);
          setSavedSnmpEnabled(snmp);
          const http = data.http_fingerprint_enabled ?? false;
          setHttpFingerprintEnabled(http);
          setSavedHttpFingerprintEnabled(http);
        }
      )
      .catch(() => {});
  }, []);

  const scannerDirty =
    scanInterval !== savedScanInterval ||
    scanSubnets !== savedScanSubnets ||
    pingSweepEnabled !== savedPingSweepEnabled ||
    nmapEnabled !== savedNmapEnabled ||
    netbiosEnabled !== savedNetbiosEnabled ||
    snmpEnabled !== savedSnmpEnabled ||
    httpFingerprintEnabled !== savedHttpFingerprintEnabled;

  // Inline validation
  const intervalNum = parseInt(scanInterval, 10);
  const intervalValid =
    scanInterval.length === 0
      ? "idle"
      : !isNaN(intervalNum) && intervalNum >= 10
        ? "valid"
        : "error";

  async function handleScannerSave() {
    settingsLoadTokenRef.current++;
    setScannerStatus("loading");
    setScannerMsg("");
    try {
      const interval = parseInt(scanInterval, 10);
      if (isNaN(interval) || interval < 10) {
        setScannerStatus("error");
        setScannerMsg("Scan interval must be at least 10 seconds.");
        return;
      }

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_interval_seconds: interval,
          scan_subnets: scanSubnets,
          ping_sweep_enabled: pingSweepEnabled,
          nmap_scan_enabled: nmapEnabled,
          netbios_scan_enabled: netbiosEnabled,
          snmp_scan_enabled: snmpEnabled,
          http_fingerprint_enabled: httpFingerprintEnabled,
        }),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const newInterval = String(data.scan_interval_seconds ?? interval);
        setScanInterval(newInterval);
        setSavedScanInterval(newInterval);
        const newSubnets = data.scan_subnets ?? scanSubnets;
        setScanSubnets(newSubnets);
        setSavedScanSubnets(newSubnets);
        const newPing = data.ping_sweep_enabled ?? pingSweepEnabled;
        setPingSweepEnabled(newPing);
        setSavedPingSweepEnabled(newPing);
        const newNmap = data.nmap_scan_enabled ?? nmapEnabled;
        setNmapEnabled(newNmap);
        setSavedNmapEnabled(newNmap);
        const newNetbios = data.netbios_scan_enabled ?? netbiosEnabled;
        setNetbiosEnabled(newNetbios);
        setSavedNetbiosEnabled(newNetbios);
        const newSnmp = data.snmp_scan_enabled ?? snmpEnabled;
        setSnmpEnabled(newSnmp);
        setSavedSnmpEnabled(newSnmp);
        const newHttp = data.http_fingerprint_enabled ?? httpFingerprintEnabled;
        setHttpFingerprintEnabled(newHttp);
        setSavedHttpFingerprintEnabled(newHttp);
        setScannerStatus("success");
        setScannerMsg("Scanner settings saved.");
        setTimeout(() => setScannerStatus("idle"), 3000);
      } else {
        setScannerStatus("error");
        setScannerMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setScannerStatus("error");
      setScannerMsg("Network error.");
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-mesh-border text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Network Scanner</h1>
        </div>

        {/* Scan Configuration Section */}
        <SettingsSection
          icon={<Search className="h-4 w-4 text-mesh-accent" />}
          iconBg="bg-mesh-accent/10"
          title="Scan Configuration"
          description="Configure ARP scanning interval, target subnets, and ping sweep."
        >
          <div className="space-y-1.5">
            <Label htmlFor="scan-interval" className="text-xs text-mesh-text-dim">
              Scan interval (seconds)
            </Label>
            <div className="relative">
              <Input
                id="scan-interval"
                type="number"
                min={10}
                value={scanInterval}
                onChange={(e) => setScanInterval(e.target.value)}
                className={`border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                  intervalValid === "valid"
                    ? "border-[#4ade80]/40"
                    : intervalValid === "error"
                      ? "border-[#fb7185]/40"
                      : ""
                }`}
                placeholder="60"
              />
              {intervalValid === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                </div>
              )}
            </div>
            {intervalValid === "error" && (
              <p className="animate-fade-in text-xs text-[#fb7185]">
                Must be at least 10 seconds.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scan-subnets" className="text-xs text-mesh-text-dim">
              Subnets to scan (comma-separated CIDR)
            </Label>
            <Input
              id="scan-subnets"
              type="text"
              value={scanSubnets}
              onChange={(e) => setScanSubnets(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
              placeholder="10.0.0.0/24, 192.168.1.0/24"
            />
            <p className="text-[10px] text-mesh-text-mute">
              Leave empty to auto-detect from router interfaces.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={pingSweepEnabled}
              onClick={() => setPingSweepEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                pingSweepEnabled ? "bg-mesh-accent" : "bg-mesh-border-strong"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  pingSweepEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <Label className="text-xs text-mesh-text-dim cursor-pointer" onClick={() => setPingSweepEnabled((v) => !v)}>
              Active ping sweep
            </Label>
          </div>
        </SettingsSection>

        {/* Enrichment Sources Section */}
        <SettingsSection
          icon={<Layers className="h-4 w-4 text-[#a78bfa]" />}
          iconBg="bg-[#a78bfa]/10"
          title="Enrichment Sources"
          description="Enable additional discovery methods for richer device data."
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={nmapEnabled}
                data-testid="nmap-toggle"
                onClick={() => setNmapEnabled((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  nmapEnabled ? "bg-mesh-accent" : "bg-mesh-border-strong"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    nmapEnabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div>
                <Label className="text-xs text-mesh-text-dim cursor-pointer" onClick={() => setNmapEnabled((v) => !v)}>
                  Nmap service detection
                </Label>
                <p className="text-[10px] text-mesh-text-mute">
                  Scan open ports and detect services (requires nmap)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={netbiosEnabled}
                data-testid="netbios-toggle"
                onClick={() => setNetbiosEnabled((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  netbiosEnabled ? "bg-mesh-accent" : "bg-mesh-border-strong"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    netbiosEnabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div>
                <Label className="text-xs text-mesh-text-dim cursor-pointer" onClick={() => setNetbiosEnabled((v) => !v)}>
                  NetBIOS name lookup
                </Label>
                <p className="text-[10px] text-mesh-text-mute">
                  Discover Windows machine names (requires nmblookup)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={snmpEnabled}
                data-testid="snmp-toggle"
                onClick={() => setSnmpEnabled((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  snmpEnabled ? "bg-mesh-accent" : "bg-mesh-border-strong"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    snmpEnabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div>
                <Label className="text-xs text-mesh-text-dim cursor-pointer" onClick={() => setSnmpEnabled((v) => !v)}>
                  SNMP discovery
                </Label>
                <p className="text-[10px] text-mesh-text-mute">
                  Query managed switches/routers via SNMP (requires snmpget)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={httpFingerprintEnabled}
                data-testid="http-fingerprint-toggle"
                onClick={() => setHttpFingerprintEnabled((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  httpFingerprintEnabled ? "bg-mesh-accent" : "bg-mesh-border-strong"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    httpFingerprintEnabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div>
                <Label className="text-xs text-mesh-text-dim cursor-pointer" onClick={() => setHttpFingerprintEnabled((v) => !v)}>
                  HTTP fingerprinting
                </Label>
                <p className="text-[10px] text-mesh-text-mute">
                  Detect web servers and infer device type from HTTP headers
                </p>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Status messages */}
        {scannerStatus === "success" && scannerMsg && (
          <div className="flex items-center gap-2 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
            <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
            <p className="text-xs text-[#4ade80]">{scannerMsg}</p>
          </div>
        )}
        {scannerStatus === "error" && scannerMsg && (
          <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
            <p className="text-xs text-[#fb7185]">{scannerMsg}</p>
          </div>
        )}

        <SaveButton
          status={scannerStatus}
          disabled={!scannerDirty}
          onClick={handleScannerSave}
        />
      </div>
    </PageTransition>
  );
}
