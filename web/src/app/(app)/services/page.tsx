"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Globe,
  Shield,
  Network,
  ArrowRight,
  Server,
  Eye,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageTransition } from "@/components/PageTransition";
import {
  addService,
  removeService,
  fetchNpmProxyHosts,
  fetchRouterFirewall,
  fetchNpmStatus,
  fetchRouterStatus,
  fetchNpmCertificates,
  fetchRouterInterfaces,
} from "@/lib/api";
import type {
  AddServiceRequest,
  StepResult,
  NpmProxyHost,
  FirewallChain,
  NpmConnectionStatus,
  RouterStatus,
  NpmCertificate,
  VyosInterface,
} from "@/lib/types";

// ─── Styled select matching the dark theme ──────────────────

function DarkSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`flex h-10 w-full rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

// ─── Wizard Steps ───────────────────────────────────────────

const WIZARD_STEPS = [
  { id: "info", label: "Service Info", icon: Server },
  { id: "backend", label: "Backend", icon: Zap },
  { id: "access", label: "Public Access", icon: Globe },
  { id: "ssl", label: "SSL", icon: Shield },
  { id: "firewall", label: "Firewall", icon: Shield },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "apply", label: "Apply", icon: CheckCircle2 },
] as const;

type WizardStep = (typeof WIZARD_STEPS)[number]["id"];

// ─── Form State ─────────────────────────────────────────────

interface WizardForm {
  // Step 1: Info
  name: string;
  description: string;
  // Step 2: Backend
  internal_ip: string;
  internal_port: string;
  forward_scheme: string;
  // Step 3: Public Access
  enable_npm: boolean;
  domain_names: string;
  enable_dnat: boolean;
  dnat_external_port: string;
  dnat_inbound_interface: string;
  dnat_protocol: string;
  dnat_rule_number: string;
  // Step 4: SSL
  ssl_mode: string;
  letsencrypt_email: string;
  ssl_forced: boolean;
  http2_support: boolean;
  block_exploits: boolean;
  allow_websocket_upgrade: boolean;
  // Step 5: Firewall
  enable_firewall: boolean;
  firewall_chain: string;
  firewall_rule_number: string;
  firewall_protocol: string;
  firewall_source_address: string;
}

const emptyForm: WizardForm = {
  name: "",
  description: "",
  internal_ip: "",
  internal_port: "",
  forward_scheme: "http",
  enable_npm: true,
  domain_names: "",
  enable_dnat: false,
  dnat_external_port: "",
  dnat_inbound_interface: "",
  dnat_protocol: "tcp",
  dnat_rule_number: "",
  enable_firewall: true,
  firewall_chain: "ipv4.forward.filter",
  firewall_rule_number: "",
  firewall_protocol: "tcp",
  firewall_source_address: "",
  ssl_mode: "letsencrypt",
  letsencrypt_email: "",
  ssl_forced: true,
  http2_support: true,
  block_exploits: true,
  allow_websocket_upgrade: true,
};

// ─── Page Component ─────────────────────────────────────────

export default function ServicesPage() {
  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("info");
  const [form, setForm] = useState<WizardForm>(emptyForm);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<StepResult[]>([]);

  // Remove dialog state
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeHost, setRemoveHost] = useState<NpmProxyHost | null>(null);
  const [removeFirewall, setRemoveFirewall] = useState(false);
  const [removeFirewallChain, setRemoveFirewallChain] = useState("");
  const [removeFirewallRule, setRemoveFirewallRule] = useState("");
  const [removeDnat, setRemoveDnat] = useState(false);
  const [removeDnatRule, setRemoveDnatRule] = useState("");
  const [removing, setRemoving] = useState(false);
  const [removeResults, setRemoveResults] = useState<StepResult[]>([]);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  // Status data
  const [npmStatus, setNpmStatus] = useState<NpmConnectionStatus | null>(null);
  const [routerStatus, setRouterStatus] = useState<RouterStatus | null>(null);
  const [proxyHosts, setProxyHosts] = useState<NpmProxyHost[]>([]);
  const [firewallChains, setFirewallChains] = useState<FirewallChain[]>([]);
  const [certificates, setCertificates] = useState<NpmCertificate[]>([]);
  const [interfaces, setInterfaces] = useState<VyosInterface[]>([]);
  const [loading, setLoading] = useState(true);

  // Load status data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [npm, router] = await Promise.allSettled([
        fetchNpmStatus(),
        fetchRouterStatus(),
      ]);
      if (npm.status === "fulfilled") setNpmStatus(npm.value);
      if (router.status === "fulfilled") setRouterStatus(router.value);

      const loads = await Promise.allSettled([
        fetchNpmProxyHosts(),
        fetchRouterFirewall(),
        fetchNpmCertificates(),
        fetchRouterInterfaces(),
      ]);
      if (loads[0].status === "fulfilled")
        setProxyHosts(loads[0].value);
      if (loads[1].status === "fulfilled")
        setFirewallChains(loads[1].value.chains);
      if (loads[2].status === "fulfilled")
        setCertificates(loads[2].value);
      if (loads[3].status === "fulfilled")
        setInterfaces(loads[3].value);
    } catch {
      // Errors are handled per-call
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Wizard Navigation ──

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);

  const canNext = (): boolean => {
    switch (step) {
      case "info":
        return form.name.trim().length > 0;
      case "backend":
        return (
          form.internal_ip.trim().length > 0 &&
          parseInt(form.internal_port) > 0
        );
      case "access":
        if (!form.enable_npm && !form.enable_dnat) return false;
        if (form.enable_npm && form.domain_names.trim().length === 0)
          return false;
        if (
          form.enable_dnat &&
          (parseInt(form.dnat_external_port) <= 0 ||
            parseInt(form.dnat_rule_number) <= 0)
        )
          return false;
        return true;
      case "ssl":
        if (!form.enable_npm) return true;
        if (
          form.ssl_mode === "letsencrypt" &&
          form.letsencrypt_email.trim().length === 0
        )
          return false;
        return true;
      case "firewall":
        if (!form.enable_firewall) return true;
        return (
          form.firewall_chain.trim().length > 0 &&
          parseInt(form.firewall_rule_number) > 0
        );
      default:
        return true;
    }
  };

  const goNext = () => {
    let nextIdx = stepIndex + 1;
    // Skip SSL step if NPM is disabled
    if (WIZARD_STEPS[nextIdx]?.id === "ssl" && !form.enable_npm) {
      nextIdx++;
    }
    if (nextIdx < WIZARD_STEPS.length) {
      setStep(WIZARD_STEPS[nextIdx].id);
    }
  };

  const goPrev = () => {
    let prevIdx = stepIndex - 1;
    // Skip SSL step if NPM is disabled
    if (WIZARD_STEPS[prevIdx]?.id === "ssl" && !form.enable_npm) {
      prevIdx--;
    }
    if (prevIdx >= 0) {
      setStep(WIZARD_STEPS[prevIdx].id);
    }
  };

  const openWizard = () => {
    setForm(emptyForm);
    setStep("info");
    setResults([]);
    setApplying(false);
    setWizardOpen(true);
  };

  // ── Apply ──

  const handleApply = async () => {
    setApplying(true);
    setResults([]);

    const domains = form.domain_names
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    const req: AddServiceRequest = {
      name: form.name,
      description: form.description || undefined,
      internal_ip: form.internal_ip,
      internal_port: parseInt(form.internal_port),
      forward_scheme: form.forward_scheme,
      domain_names: form.enable_npm ? domains : undefined,
      ssl_mode: form.enable_npm ? form.ssl_mode : "none",
      letsencrypt_email:
        form.ssl_mode === "letsencrypt" ? form.letsencrypt_email : undefined,
      ssl_forced: form.ssl_forced,
      http2_support: form.http2_support,
      block_exploits: form.block_exploits,
      allow_websocket_upgrade: form.allow_websocket_upgrade,
      create_firewall_rule: form.enable_firewall,
      firewall_chain: form.enable_firewall ? form.firewall_chain : undefined,
      firewall_rule_number: form.enable_firewall
        ? parseInt(form.firewall_rule_number)
        : undefined,
      firewall_protocol: form.enable_firewall
        ? form.firewall_protocol
        : undefined,
      firewall_source_address: form.firewall_source_address || undefined,
      create_dnat_rule: form.enable_dnat,
      dnat_rule_number: form.enable_dnat
        ? parseInt(form.dnat_rule_number)
        : undefined,
      dnat_external_port: form.enable_dnat
        ? parseInt(form.dnat_external_port)
        : undefined,
      dnat_inbound_interface: form.dnat_inbound_interface || undefined,
      dnat_protocol: form.enable_dnat ? form.dnat_protocol : undefined,
    };

    try {
      const res = await addService(req);
      setResults(res.steps);
      setStep("apply");
      if (res.success) {
        toast.success("Service created successfully");
      } else {
        toast.error("Some steps failed — check results");
      }
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(msg);
      setResults([
        { step: "error", success: false, message: msg, resource_id: null },
      ]);
      setStep("apply");
    } finally {
      setApplying(false);
    }
  };

  // ── Remove Service ──

  const openRemoveDialog = () => {
    setRemoveHost(null);
    setRemoveFirewall(false);
    setRemoveFirewallChain("");
    setRemoveFirewallRule("");
    setRemoveDnat(false);
    setRemoveDnatRule("");
    setRemoveResults([]);
    setRemoving(false);
    setRemoveOpen(true);
  };

  const handleRemoveConfirm = () => {
    setConfirmRemoveOpen(true);
  };

  const handleRemoveExecute = async () => {
    setConfirmRemoveOpen(false);
    setRemoving(true);

    const resources: { resource_type: string; resource_id: string; chain?: string }[] = [];

    if (removeHost) {
      resources.push({
        resource_type: "npm_proxy_host",
        resource_id: String(removeHost.id),
      });
    }
    if (removeFirewall && removeFirewallRule) {
      resources.push({
        resource_type: "firewall_rule",
        resource_id: removeFirewallRule,
        chain: removeFirewallChain || undefined,
      });
    }
    if (removeDnat && removeDnatRule) {
      resources.push({
        resource_type: "dnat_rule",
        resource_id: removeDnatRule,
      });
    }

    if (resources.length === 0) {
      toast.error("No resources selected to remove");
      setRemoving(false);
      return;
    }

    try {
      const res = await removeService({
        name: removeHost
          ? removeHost.domain_names.join(", ")
          : "Service removal",
        resources,
      });
      setRemoveResults(res.steps);
      if (res.success) {
        toast.success("Service removed successfully");
      } else {
        toast.error("Some steps failed — check results");
      }
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(msg);
      setRemoveResults([
        { step: "error", success: false, message: msg, resource_id: null },
      ]);
    } finally {
      setRemoving(false);
    }
  };

  // ── Build preview lines ──

  const previewLines: { label: string; value: string; type: string }[] = [];

  if (form.enable_npm) {
    const domains = form.domain_names
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    previewLines.push({
      label: "NPM Proxy Host",
      value: `${domains.join(", ")} → ${form.forward_scheme}://${form.internal_ip}:${form.internal_port}`,
      type: "npm",
    });
    if (form.ssl_mode === "letsencrypt") {
      previewLines.push({
        label: "SSL Certificate",
        value: `Let's Encrypt for ${domains.join(", ")}`,
        type: "ssl",
      });
    } else if (form.ssl_mode !== "none") {
      previewLines.push({
        label: "SSL Certificate",
        value: `Certificate #${form.ssl_mode}`,
        type: "ssl",
      });
    }
  }

  if (form.enable_firewall) {
    previewLines.push({
      label: "Firewall Rule",
      value: `Rule #${form.firewall_rule_number} in ${form.firewall_chain}: accept ${form.firewall_protocol} to ${form.internal_ip}:${form.internal_port}`,
      type: "firewall",
    });
  }

  if (form.enable_dnat) {
    previewLines.push({
      label: "DNAT Rule",
      value: `Rule #${form.dnat_rule_number}: port ${form.dnat_external_port} → ${form.internal_ip}:${form.internal_port} (${form.dnat_protocol})`,
      type: "dnat",
    });
  }

  // ── Render ──

  const npmConfigured = npmStatus?.configured && npmStatus?.reachable;
  const routerConfigured = routerStatus?.configured && routerStatus?.reachable;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Services</h1>
            <p className="mt-1 text-sm text-slate-400">
              Deploy or remove services end-to-end — NPM reverse proxy,
              firewall, and DNAT in one flow.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={openRemoveDialog}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove Service
            </Button>
            <Button onClick={openWizard}>
              <Plus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-orange-400" />
              <div>
                <p className="text-sm font-medium text-white">
                  Nginx Proxy Manager
                </p>
                <p className="text-xs text-slate-400">
                  {loading
                    ? "Checking..."
                    : npmConfigured
                      ? `Connected — ${proxyHosts.length} proxy host${proxyHosts.length === 1 ? "" : "s"}`
                      : npmStatus?.configured
                        ? "Unreachable"
                        : "Not configured"}
                </p>
              </div>
              <span
                className={`ml-auto inline-block h-2 w-2 rounded-full ${npmConfigured ? "bg-emerald-400" : npmStatus?.configured ? "bg-rose-400" : "bg-slate-600"}`}
              />
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-blue-400" />
              <div>
                <p className="text-sm font-medium text-white">VyOS Router</p>
                <p className="text-xs text-slate-400">
                  {loading
                    ? "Checking..."
                    : routerConfigured
                      ? `Connected — ${firewallChains.length} firewall chain${firewallChains.length === 1 ? "" : "s"}`
                      : routerStatus?.configured
                        ? "Unreachable"
                        : "Not configured"}
                </p>
              </div>
              <span
                className={`ml-auto inline-block h-2 w-2 rounded-full ${routerConfigured ? "bg-emerald-400" : routerStatus?.configured ? "bg-rose-400" : "bg-slate-600"}`}
              />
            </div>
          </div>
        </div>

        {/* Existing Proxy Hosts Table */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-medium text-white">
              Active Proxy Hosts
            </h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading...
            </div>
          ) : proxyHosts.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No proxy hosts configured yet. Click &quot;Add Service&quot; to
              create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    <th className="px-4 py-3 font-medium text-slate-400">
                      Domains
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-400">
                      Forward To
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-400">
                      SSL
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-400">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {proxyHosts.map((host) => (
                    <tr
                      key={host.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {host.domain_names.map((d) => (
                            <span
                              key={d}
                              className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        {host.forward_scheme}://{host.forward_host}:
                        {host.forward_port}
                      </td>
                      <td className="px-4 py-3">
                        {host.ssl_forced ? (
                          <span className="text-xs text-emerald-400">
                            Forced
                          </span>
                        ) : host.certificate_id &&
                          host.certificate_id !== 0 ? (
                          <span className="text-xs text-blue-400">Active</span>
                        ) : (
                          <span className="text-xs text-slate-500">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${host.enabled ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-700 text-slate-400"}`}
                        >
                          {host.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Add Service Wizard Dialog ── */}
        <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
          <DialogContent className="max-w-2xl border-slate-800 bg-slate-950 text-white sm:max-w-[680px]">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Add Service
              </DialogTitle>
            </DialogHeader>

            {/* Step indicator */}
            <div className="flex items-center gap-1 overflow-x-auto px-1 pb-2">
              {WIZARD_STEPS.map((s, i) => {
                // Skip SSL in indicator if npm disabled
                if (s.id === "ssl" && !form.enable_npm) return null;
                const Icon = s.icon;
                const isActive = s.id === step;
                const isDone = i < stepIndex;
                return (
                  <div key={s.id} className="flex items-center gap-1">
                    {i > 0 && (
                      <ChevronRight className="h-3 w-3 shrink-0 text-slate-700" />
                    )}
                    <button
                      onClick={() => {
                        if (isDone) setStep(s.id);
                      }}
                      disabled={!isDone && !isActive}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors ${
                        isActive
                          ? "bg-blue-500/20 text-blue-400"
                          : isDone
                            ? "text-slate-400 hover:text-white cursor-pointer"
                            : "text-slate-600 cursor-default"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {s.label}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="min-h-[320px] space-y-4 py-2">
              {/* Step 1: Service Info */}
              {step === "info" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-300">
                      Service Name <span className="text-rose-400">*</span>
                    </Label>
                    <Input
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="e.g. Grafana, GitLab, Home Assistant"
                      className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">
                      Description (optional)
                    </Label>
                    <Input
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      placeholder="e.g. Monitoring dashboard"
                      className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Backend */}
              {step === "backend" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-300">
                      Internal IP Address{" "}
                      <span className="text-rose-400">*</span>
                    </Label>
                    <Input
                      value={form.internal_ip}
                      onChange={(e) =>
                        setForm({ ...form, internal_ip: e.target.value })
                      }
                      placeholder="e.g. 192.168.1.100"
                      className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300">
                        Internal Port{" "}
                        <span className="text-rose-400">*</span>
                      </Label>
                      <Input
                        type="number"
                        value={form.internal_port}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            internal_port: e.target.value,
                          })
                        }
                        placeholder="e.g. 3000"
                        className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Scheme</Label>
                      <DarkSelect
                        value={form.forward_scheme}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            forward_scheme: e.target.value,
                          })
                        }
                        className="mt-1"
                      >
                        <option value="http">HTTP</option>
                        <option value="https">HTTPS</option>
                      </DarkSelect>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Public Access */}
              {step === "access" && (
                <div className="space-y-5">
                  {/* NPM Section */}
                  <div className="space-y-3 rounded-lg border border-slate-800 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-orange-400" />
                        <span className="text-sm font-medium text-white">
                          Domain (NPM Proxy Host)
                        </span>
                      </div>
                      <Switch
                        checked={form.enable_npm}
                        onCheckedChange={(v) =>
                          setForm({ ...form, enable_npm: v })
                        }
                      />
                    </div>
                    {form.enable_npm && (
                      <div>
                        <Label className="text-slate-300">
                          Domain Names{" "}
                          <span className="text-rose-400">*</span>
                        </Label>
                        <Input
                          value={form.domain_names}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              domain_names: e.target.value,
                            })
                          }
                          placeholder="grafana.example.com, monitoring.example.com"
                          className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Comma-separated domain names
                        </p>
                        {!npmConfigured && (
                          <p className="mt-2 text-xs text-amber-400">
                            NPM is not configured. Configure it in Settings
                            first.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* DNAT Section */}
                  <div className="space-y-3 rounded-lg border border-slate-800 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-blue-400" />
                        <span className="text-sm font-medium text-white">
                          Direct Port (VyOS DNAT)
                        </span>
                      </div>
                      <Switch
                        checked={form.enable_dnat}
                        onCheckedChange={(v) =>
                          setForm({ ...form, enable_dnat: v })
                        }
                      />
                    </div>
                    {form.enable_dnat && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-slate-300">
                              External Port{" "}
                              <span className="text-rose-400">*</span>
                            </Label>
                            <Input
                              type="number"
                              value={form.dnat_external_port}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  dnat_external_port: e.target.value,
                                })
                              }
                              placeholder="e.g. 8080"
                              className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-300">
                              Rule Number{" "}
                              <span className="text-rose-400">*</span>
                            </Label>
                            <Input
                              type="number"
                              value={form.dnat_rule_number}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  dnat_rule_number: e.target.value,
                                })
                              }
                              placeholder="e.g. 10"
                              className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-slate-300">Protocol</Label>
                            <DarkSelect
                              value={form.dnat_protocol}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  dnat_protocol: e.target.value,
                                })
                              }
                              className="mt-1"
                            >
                              <option value="tcp">TCP</option>
                              <option value="udp">UDP</option>
                              <option value="tcp_udp">TCP+UDP</option>
                            </DarkSelect>
                          </div>
                          <div>
                            <Label className="text-slate-300">
                              Inbound Interface
                            </Label>
                            <DarkSelect
                              value={form.dnat_inbound_interface}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  dnat_inbound_interface: e.target.value,
                                })
                              }
                              className="mt-1"
                            >
                              <option value="">Any</option>
                              {interfaces.map((iface) => (
                                <option key={iface.name} value={iface.name}>
                                  {iface.name}
                                  {iface.description
                                    ? ` (${iface.description})`
                                    : ""}
                                </option>
                              ))}
                            </DarkSelect>
                          </div>
                        </div>
                        {!routerConfigured && (
                          <p className="text-xs text-amber-400">
                            VyOS router is not configured. Configure it in
                            Settings first.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: SSL */}
              {step === "ssl" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-300">SSL Mode</Label>
                    <DarkSelect
                      value={form.ssl_mode}
                      onChange={(e) =>
                        setForm({ ...form, ssl_mode: e.target.value })
                      }
                      className="mt-1"
                    >
                      <option value="letsencrypt">
                        Let&apos;s Encrypt (auto)
                      </option>
                      <option value="none">None</option>
                      {certificates.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.nice_name} (#{c.id})
                        </option>
                      ))}
                    </DarkSelect>
                  </div>
                  {form.ssl_mode === "letsencrypt" && (
                    <div>
                      <Label className="text-slate-300">
                        Email for Let&apos;s Encrypt{" "}
                        <span className="text-rose-400">*</span>
                      </Label>
                      <Input
                        type="email"
                        value={form.letsencrypt_email}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            letsencrypt_email: e.target.value,
                          })
                        }
                        placeholder="admin@example.com"
                        className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                      />
                    </div>
                  )}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Force SSL</Label>
                      <Switch
                        checked={form.ssl_forced}
                        onCheckedChange={(v) =>
                          setForm({ ...form, ssl_forced: v })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">HTTP/2 Support</Label>
                      <Switch
                        checked={form.http2_support}
                        onCheckedChange={(v) =>
                          setForm({ ...form, http2_support: v })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Block Exploits</Label>
                      <Switch
                        checked={form.block_exploits}
                        onCheckedChange={(v) =>
                          setForm({ ...form, block_exploits: v })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">
                        Allow WebSocket Upgrade
                      </Label>
                      <Switch
                        checked={form.allow_websocket_upgrade}
                        onCheckedChange={(v) =>
                          setForm({ ...form, allow_websocket_upgrade: v })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Firewall */}
              {step === "firewall" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-slate-300">
                        Create Firewall Allow Rule
                      </Label>
                      <p className="text-xs text-slate-500">
                        Auto-create a VyOS firewall rule to allow traffic
                      </p>
                    </div>
                    <Switch
                      checked={form.enable_firewall}
                      onCheckedChange={(v) =>
                        setForm({ ...form, enable_firewall: v })
                      }
                    />
                  </div>

                  {form.enable_firewall && (
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-slate-300">
                            Firewall Chain{" "}
                            <span className="text-rose-400">*</span>
                          </Label>
                          <DarkSelect
                            value={form.firewall_chain}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                firewall_chain: e.target.value,
                              })
                            }
                            className="mt-1"
                          >
                            {firewallChains.length > 0 ? (
                              firewallChains.map((c) => (
                                <option
                                  key={c.path.join(".")}
                                  value={c.path.join(".")}
                                >
                                  {c.name} ({c.path.join(".")})
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="ipv4.forward.filter">
                                  IPv4 Forward Filter
                                </option>
                                <option value="ipv4.input.filter">
                                  IPv4 Input Filter
                                </option>
                              </>
                            )}
                          </DarkSelect>
                        </div>
                        <div>
                          <Label className="text-slate-300">
                            Rule Number{" "}
                            <span className="text-rose-400">*</span>
                          </Label>
                          <Input
                            type="number"
                            value={form.firewall_rule_number}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                firewall_rule_number: e.target.value,
                              })
                            }
                            placeholder="e.g. 100"
                            className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-slate-300">Protocol</Label>
                          <DarkSelect
                            value={form.firewall_protocol}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                firewall_protocol: e.target.value,
                              })
                            }
                            className="mt-1"
                          >
                            <option value="tcp">TCP</option>
                            <option value="udp">UDP</option>
                            <option value="tcp_udp">TCP+UDP</option>
                          </DarkSelect>
                        </div>
                        <div>
                          <Label className="text-slate-300">
                            Source Address (optional)
                          </Label>
                          <Input
                            value={form.firewall_source_address}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                firewall_source_address: e.target.value,
                              })
                            }
                            placeholder="e.g. 10.0.0.0/8"
                            className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                          />
                        </div>
                      </div>
                      {!routerConfigured && (
                        <p className="text-xs text-amber-400">
                          VyOS router is not configured. Configure it in
                          Settings first.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 6: Preview */}
              {step === "preview" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    The following resources will be created for{" "}
                    <span className="font-medium text-white">{form.name}</span>:
                  </p>
                  <div className="space-y-2">
                    {previewLines.map((line, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-3"
                      >
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                        <div>
                          <p className="text-sm font-medium text-white">
                            {line.label}
                          </p>
                          <p className="text-xs text-slate-400">{line.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {previewLines.length === 0 && (
                    <p className="text-sm text-slate-500">
                      No operations selected. Go back and enable at least one.
                    </p>
                  )}
                </div>
              )}

              {/* Step 7: Apply / Results */}
              {step === "apply" && (
                <div className="space-y-4">
                  {applying ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                      <p className="mt-3 text-sm text-slate-400">
                        Creating service resources...
                      </p>
                    </div>
                  ) : results.length > 0 ? (
                    <div className="space-y-2">
                      {results.map((r, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                            r.success
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-rose-500/30 bg-rose-500/5"
                          }`}
                        >
                          {r.success ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                          ) : (
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-white">
                              {stepLabel(r.step)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {r.message}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Ready to apply. Click &quot;Create Service&quot; below.
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between border-t border-slate-800 pt-4 sm:justify-between">
              <div>
                {stepIndex > 0 && step !== "apply" && (
                  <Button
                    variant="ghost"
                    onClick={goPrev}
                    className="text-slate-400"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {step === "apply" && results.length > 0 ? (
                  <Button
                    onClick={() => setWizardOpen(false)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Done
                  </Button>
                ) : step === "preview" ? (
                  <Button
                    onClick={handleApply}
                    disabled={applying || previewLines.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {applying ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Create Service
                  </Button>
                ) : (
                  <Button
                    onClick={goNext}
                    disabled={!canNext()}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Remove Service Dialog ── */}
        <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
          <DialogContent className="max-w-lg border-slate-800 bg-slate-950 text-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Remove Service
              </DialogTitle>
            </DialogHeader>

            {removeResults.length > 0 ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-slate-400">Removal results:</p>
                {removeResults.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                      r.success
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-rose-500/30 bg-rose-500/5"
                    }`}
                  >
                    {r.success ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">
                        {stepLabel(r.step)}
                      </p>
                      <p className="text-xs text-slate-400">{r.message}</p>
                    </div>
                  </div>
                ))}
                <DialogFooter>
                  <Button onClick={() => setRemoveOpen(false)}>Done</Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-5 py-2">
                <p className="text-sm text-slate-400">
                  Select the resources to remove. All selected items will be
                  deleted.
                </p>

                {/* NPM proxy host */}
                <div className="space-y-2 rounded-lg border border-slate-800 p-4">
                  <Label className="text-slate-300">NPM Proxy Host</Label>
                  <DarkSelect
                    value={removeHost ? String(removeHost.id) : ""}
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      const found = proxyHosts.find((h) => h.id === id);
                      setRemoveHost(found ?? null);
                    }}
                  >
                    <option value="">-- none --</option>
                    {proxyHosts.map((h) => (
                      <option key={h.id} value={String(h.id)}>
                        {h.domain_names.join(", ")} → {h.forward_host}:
                        {h.forward_port}
                      </option>
                    ))}
                  </DarkSelect>
                </div>

                {/* Firewall rule */}
                <div className="space-y-2 rounded-lg border border-slate-800 p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Firewall Rule</Label>
                    <Switch
                      checked={removeFirewall}
                      onCheckedChange={setRemoveFirewall}
                    />
                  </div>
                  {removeFirewall && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div>
                        <Label className="text-xs text-slate-400">Chain</Label>
                        <DarkSelect
                          value={removeFirewallChain}
                          onChange={(e) =>
                            setRemoveFirewallChain(e.target.value)
                          }
                          className="mt-1"
                        >
                          <option value="">Select chain</option>
                          {firewallChains.map((c) => (
                            <option
                              key={c.path.join(".")}
                              value={c.path.join(".")}
                            >
                              {c.name}
                            </option>
                          ))}
                        </DarkSelect>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-400">
                          Rule #
                        </Label>
                        <Input
                          type="number"
                          value={removeFirewallRule}
                          onChange={(e) =>
                            setRemoveFirewallRule(e.target.value)
                          }
                          placeholder="e.g. 100"
                          className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* DNAT rule */}
                <div className="space-y-2 rounded-lg border border-slate-800 p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">DNAT Rule</Label>
                    <Switch
                      checked={removeDnat}
                      onCheckedChange={setRemoveDnat}
                    />
                  </div>
                  {removeDnat && (
                    <div className="pt-2">
                      <Label className="text-xs text-slate-400">Rule #</Label>
                      <Input
                        type="number"
                        value={removeDnatRule}
                        onChange={(e) => setRemoveDnatRule(e.target.value)}
                        placeholder="e.g. 10"
                        className="mt-1 border-slate-800 bg-slate-900/50 text-white"
                      />
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setRemoveOpen(false)}
                    className="border-slate-700 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRemoveConfirm}
                    disabled={
                      removing ||
                      (!removeHost &&
                        !(removeFirewall && removeFirewallRule) &&
                        !(removeDnat && removeDnatRule))
                    }
                  >
                    {removing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Remove Selected
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Confirm Remove AlertDialog ── */}
        <AlertDialog
          open={confirmRemoveOpen}
          onOpenChange={setConfirmRemoveOpen}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-950">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Confirm Removal
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                This will permanently remove the selected resources. This action
                cannot be undone.
                <span className="mt-2 block space-y-1 text-sm">
                  {removeHost && (
                    <span className="block text-rose-400">
                      NPM Proxy Host:{" "}
                      {removeHost.domain_names.join(", ")}
                    </span>
                  )}
                  {removeFirewall && removeFirewallRule && (
                    <span className="block text-rose-400">
                      Firewall Rule #{removeFirewallRule} in{" "}
                      {removeFirewallChain}
                    </span>
                  )}
                  {removeDnat && removeDnatRule && (
                    <span className="block text-rose-400">
                      DNAT Rule #{removeDnatRule}
                    </span>
                  )}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-700 text-slate-300">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveExecute}
                className="bg-rose-600 hover:bg-rose-700"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function stepLabel(step: string): string {
  switch (step) {
    case "npm_proxy_host":
      return "NPM Proxy Host";
    case "firewall_rule":
      return "Firewall Rule";
    case "dnat_rule":
      return "DNAT Rule";
    case "remove_npm_proxy_host":
      return "Remove NPM Proxy Host";
    case "remove_firewall_rule":
      return "Remove Firewall Rule";
    case "remove_dnat_rule":
      return "Remove DNAT Rule";
    case "error":
      return "Error";
    default:
      return step;
  }
}
