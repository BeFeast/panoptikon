"use client";

import { useEffect, useRef, useState } from "react";
import {
  Radar,
  Search,
  Layers,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import {
  SettingsSection,
  ValidatedInput,
  AnimatedSaveButton,
} from "@/components/settings";
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

  const intervalNum = parseInt(scanInterval, 10);
  const intervalInvalid = isNaN(intervalNum) || intervalNum < 10;

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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-white">Network Scanner</h1>
        </div>

        <SettingsSection
          icon={<Search className="h-4 w-4 text-cyan-400" />}
          iconBg="bg-cyan-500/10"
          title="Scan Settings"
          description="Configure ARP scanning interval and target subnets."
        >
          <ValidatedInput
            id="scan-interval"
            label="Scan interval (seconds)"
            type="number"
            min={10}
            value={scanInterval}
            onChange={(e) => setScanInterval(e.target.value)}
            placeholder="60"
            validationState={
              scanInterval === "" ? "idle" : intervalInvalid ? "invalid" : "valid"
            }
            validationMessage={
              intervalInvalid && scanInterval !== ""
                ? "Must be at least 10 seconds."
                : undefined
            }
          />

          <ValidatedInput
            id="scan-subnets"
            label="Subnets to scan (comma-separated CIDR)"
            type="text"
            value={scanSubnets}
            onChange={(e) => setScanSubnets(e.target.value)}
            placeholder="10.0.0.0/24, 192.168.1.0/24"
            hint="Leave empty to auto-detect from router interfaces."
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={pingSweepEnabled}
              onClick={() => setPingSweepEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                pingSweepEnabled ? "bg-cyan-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  pingSweepEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <Label className="text-xs text-slate-400 cursor-pointer" onClick={() => setPingSweepEnabled((v) => !v)}>
              Active ping sweep
            </Label>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={<Layers className="h-4 w-4 text-cyan-400" />}
          iconBg="bg-cyan-500/10"
          title="Enrichment Sources"
          description="Enable additional device discovery methods."
        >
          {[
            {
              id: "nmap",
              label: "Nmap service detection",
              desc: "Scan open ports and detect services (requires nmap)",
              checked: nmapEnabled,
              toggle: () => setNmapEnabled((v) => !v),
            },
            {
              id: "netbios",
              label: "NetBIOS name lookup",
              desc: "Discover Windows machine names (requires nmblookup)",
              checked: netbiosEnabled,
              toggle: () => setNetbiosEnabled((v) => !v),
            },
            {
              id: "snmp",
              label: "SNMP discovery",
              desc: "Query managed switches/routers via SNMP (requires snmpget)",
              checked: snmpEnabled,
              toggle: () => setSnmpEnabled((v) => !v),
            },
            {
              id: "http-fingerprint",
              label: "HTTP fingerprinting",
              desc: "Detect web servers and infer device type from HTTP headers",
              checked: httpFingerprintEnabled,
              toggle: () => setHttpFingerprintEnabled((v) => !v),
            },
          ].map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={item.checked}
                data-testid={`${item.id}-toggle`}
                onClick={item.toggle}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  item.checked ? "bg-cyan-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    item.checked ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div>
                <Label className="text-xs text-slate-400 cursor-pointer" onClick={item.toggle}>
                  {item.label}
                </Label>
                <p className="text-[10px] text-slate-600">{item.desc}</p>
              </div>
            </div>
          ))}
        </SettingsSection>

        {scannerStatus === "error" && scannerMsg && (
          <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-xs text-rose-400">{scannerMsg}</p>
          </div>
        )}

        <AnimatedSaveButton
          onClick={handleScannerSave}
          status={scannerStatus}
          disabled={!scannerDirty || scannerStatus === "loading"}
        />
      </div>
    </PageTransition>
  );
}
