"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Server,
  Power,
  PowerOff,
  Pencil,
  Shield,
  Network,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/PageTransition";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addService,
  removeService,
  fetchCaddyProxyHosts,
  fetchCaddyStatus,
  fetchMikrotikStatus,
  toggleCaddyProxyHost,
  deleteCaddyProxyHost,
  updateCaddyProxyHost,
} from "@/lib/api";
import type {
  AddServiceRequest,
  StepResult,
  CaddyProxyHost,
  CaddyStatus,
  MikrotikStatus,
} from "@/lib/types";

// ─── Styled select matching the dark theme ──────────────────
const selectCls =
  "w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600";

// ─── Page ───────────────────────────────────────────────────
export default function ServicesPage() {
  // ── State ──
  const [hosts, setHosts] = useState<CaddyProxyHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [caddyStatus, setCaddyStatus] = useState<CaddyStatus | null>(null);
  const [mikrotikStatus, setMikrotikStatus] = useState<MikrotikStatus | null>(
    null
  );

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addResults, setAddResults] = useState<StepResult[] | null>(null);

  // Edit dialog
  const [editHost, setEditHost] = useState<CaddyProxyHost | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Delete dialog
  const [deleteHost, setDeleteHost] = useState<CaddyProxyHost | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add-form fields
  const [name, setName] = useState("");
  const [internalIp, setInternalIp] = useState("");
  const [internalPort, setInternalPort] = useState("");
  const [domain, setDomain] = useState("");
  const [forwardScheme, setForwardScheme] = useState("http");
  const [tlsEnabled, setTlsEnabled] = useState(true);
  const [createPortForward, setCreatePortForward] = useState(false);
  const [externalPort, setExternalPort] = useState("");
  const [protocol, setProtocol] = useState("tcp");

  // Edit-form fields
  const [editDomain, setEditDomain] = useState("");
  const [editForwardHost, setEditForwardHost] = useState("");
  const [editForwardPort, setEditForwardPort] = useState("");
  const [editForwardScheme, setEditForwardScheme] = useState("http");
  const [editTlsEnabled, setEditTlsEnabled] = useState(true);

  // ── Load data ──
  const loadHosts = useCallback(async () => {
    try {
      const data = await fetchCaddyProxyHosts();
      setHosts(data);
    } catch {
      toast.error("Failed to load services");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatuses = useCallback(async () => {
    try {
      const [caddy, mikrotik] = await Promise.allSettled([
        fetchCaddyStatus(),
        fetchMikrotikStatus(),
      ]);
      if (caddy.status === "fulfilled") setCaddyStatus(caddy.value);
      if (mikrotik.status === "fulfilled") setMikrotikStatus(mikrotik.value);
    } catch {
      // Ignore status fetch errors
    }
  }, []);

  useEffect(() => {
    loadHosts();
    loadStatuses();
  }, [loadHosts, loadStatuses]);

  // ── Add Service handler ──
  async function handleAddService() {
    setAdding(true);
    setAddResults(null);

    const body: AddServiceRequest = {
      name: name.trim(),
      internal_ip: internalIp.trim(),
      internal_port: parseInt(internalPort, 10) || 0,
      forward_scheme: forwardScheme,
      domain: domain.trim() || undefined,
      tls_enabled: tlsEnabled,
      create_port_forward: createPortForward,
      external_port: createPortForward
        ? parseInt(externalPort, 10) || undefined
        : undefined,
      protocol: createPortForward ? protocol : undefined,
    };

    try {
      const result = await addService(body);
      setAddResults(result.steps);
      if (result.success) {
        toast.success("Service created successfully");
        loadHosts();
      } else {
        toast.error("Some steps failed — check results");
      }
    } catch (e) {
      toast.error(`Failed to create service: ${e}`);
    } finally {
      setAdding(false);
    }
  }

  function resetAddForm() {
    setName("");
    setInternalIp("");
    setInternalPort("");
    setDomain("");
    setForwardScheme("http");
    setTlsEnabled(true);
    setCreatePortForward(false);
    setExternalPort("");
    setProtocol("tcp");
    setAddResults(null);
  }

  // ── Toggle handler ──
  async function handleToggle(host: CaddyProxyHost) {
    try {
      await toggleCaddyProxyHost(host.id, !host.enabled);
      toast.success(
        `${host.domain} ${host.enabled ? "disabled" : "enabled"}`
      );
      loadHosts();
    } catch {
      toast.error("Failed to toggle service");
    }
  }

  // ── Edit handler ──
  function openEditDialog(host: CaddyProxyHost) {
    setEditHost(host);
    setEditDomain(host.domain);
    setEditForwardHost(host.forward_host);
    setEditForwardPort(host.forward_port.toString());
    setEditForwardScheme(host.forward_scheme);
    setEditTlsEnabled(host.tls_enabled);
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editHost) return;
    setEditSaving(true);
    try {
      await updateCaddyProxyHost(editHost.id, {
        domain: editDomain.trim(),
        forward_host: editForwardHost.trim(),
        forward_port: parseInt(editForwardPort, 10) || 0,
        forward_scheme: editForwardScheme,
        tls_enabled: editTlsEnabled,
      });
      toast.success("Service updated");
      setEditOpen(false);
      loadHosts();
    } catch {
      toast.error("Failed to update service");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete handler ──
  async function handleDelete() {
    if (!deleteHost) return;
    setDeleting(true);
    try {
      await removeService({
        name: deleteHost.domain,
        resources: [
          {
            resource_type: "caddy_proxy_host",
            resource_id: deleteHost.id,
          },
        ],
      });
      toast.success(`${deleteHost.domain} deleted`);
      setDeleteOpen(false);
      setDeleteHost(null);
      loadHosts();
    } catch {
      toast.error("Failed to delete service");
    } finally {
      setDeleting(false);
    }
  }

  // ── Validation ──
  const addValid =
    name.trim().length > 0 &&
    internalIp.trim().length > 0 &&
    parseInt(internalPort, 10) > 0 &&
    (domain.trim().length > 0 || createPortForward) &&
    (!createPortForward || parseInt(externalPort, 10) > 0);

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Services</h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage reverse proxy entries and port-forwarding rules
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status indicators */}
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Shield className="h-3.5 w-3.5" />
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        caddyStatus?.reachable
                          ? "bg-emerald-400"
                          : "bg-slate-600"
                      }`}
                    />
                    <span>Caddy</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {caddyStatus?.reachable
                    ? "Caddy connected"
                    : "Caddy unreachable"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Network className="h-3.5 w-3.5" />
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        mikrotikStatus?.configured &&
                        mikrotikStatus?.reachable
                          ? "bg-emerald-400"
                          : "bg-slate-600"
                      }`}
                    />
                    <span>MikroTik</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {mikrotikStatus?.reachable
                    ? "MikroTik connected"
                    : "MikroTik unreachable"}
                </TooltipContent>
              </Tooltip>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                loadHosts();
                loadStatuses();
              }}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                resetAddForm();
                setAddOpen(true);
              }}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Service
            </Button>
          </div>
        </div>

        {/* Services table */}
        <div className="rounded-lg border border-slate-800 bg-slate-900">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-12 w-full rounded-md bg-slate-800"
                />
              ))}
            </div>
          ) : hosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Server className="mb-3 h-10 w-10" />
              <p className="text-sm">No services configured</p>
              <p className="mt-1 text-xs text-slate-600">
                Click &quot;Add Service&quot; to create your first reverse proxy
                entry
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Domain</TableHead>
                  <TableHead className="text-slate-400">Upstream</TableHead>
                  <TableHead className="text-slate-400">TLS</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-right text-slate-400">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.map((host) => (
                  <TableRow
                    key={host.id}
                    className="border-slate-800 hover:bg-slate-800/50"
                  >
                    <TableCell className="max-w-[250px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="truncate font-medium text-white">
                          {host.domain}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] text-slate-300">
                      <span className="block truncate">
                        {host.forward_scheme}://{host.forward_host}:
                        {host.forward_port}
                      </span>
                    </TableCell>
                    <TableCell>
                      {host.tls_enabled ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        >
                          HTTPS
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-slate-700 text-slate-500"
                        >
                          HTTP
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {host.enabled ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="text-xs text-emerald-400">
                            Enabled
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-slate-600" />
                          <span className="text-xs text-slate-500">
                            Disabled
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggle(host)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                            >
                              {host.enabled ? (
                                <PowerOff className="h-3.5 w-3.5" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {host.enabled ? "Disable" : "Enable"}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(host)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeleteHost(host);
                                setDeleteOpen(true);
                              }}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ── Add Service Dialog ── */}
        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetAddForm();
            }
            setAddOpen(open);
          }}
        >
          <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-white">
            <DialogHeader>
              <DialogTitle>Add Service</DialogTitle>
            </DialogHeader>

            {addResults ? (
              /* Results view */
              <div className="space-y-3">
                {addResults.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                      step.success
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-rose-500/30 bg-rose-500/10"
                    }`}
                  >
                    {step.success ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-medium ${
                          step.success ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {step.step.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-slate-400">{step.message}</p>
                    </div>
                  </div>
                ))}
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setAddOpen(false);
                      resetAddForm();
                    }}
                    className="bg-blue-600 text-white hover:bg-blue-500"
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              /* Form view */
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">
                    Service Name
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My App"
                    className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400">
                      Internal IP
                    </Label>
                    <Input
                      value={internalIp}
                      onChange={(e) => setInternalIp(e.target.value)}
                      placeholder="10.10.0.50"
                      className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400">
                      Internal Port
                    </Label>
                    <Input
                      type="number"
                      value={internalPort}
                      onChange={(e) => setInternalPort(e.target.value)}
                      placeholder="8080"
                      className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">
                    Domain
                  </Label>
                  <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="myapp.oklabs.uk"
                    className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400">
                      Forward Scheme
                    </Label>
                    <select
                      value={forwardScheme}
                      onChange={(e) => setForwardScheme(e.target.value)}
                      className={selectCls}
                    >
                      <option value="http">HTTP</option>
                      <option value="https">HTTPS</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={tlsEnabled}
                        onCheckedChange={setTlsEnabled}
                      />
                      <Label className="text-xs text-slate-400">
                        Auto TLS (HTTPS)
                      </Label>
                    </div>
                  </div>
                </div>

                {/* MikroTik port-forward section */}
                <div className="rounded-md border border-slate-800 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-slate-500" />
                      <Label className="text-xs text-slate-400">
                        MikroTik Port-Forward
                      </Label>
                    </div>
                    <Switch
                      checked={createPortForward}
                      onCheckedChange={setCreatePortForward}
                    />
                  </div>
                  {createPortForward && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-400">
                          External Port
                        </Label>
                        <Input
                          type="number"
                          value={externalPort}
                          onChange={(e) => setExternalPort(e.target.value)}
                          placeholder="443"
                          className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-400">
                          Protocol
                        </Label>
                        <select
                          value={protocol}
                          onChange={(e) => setProtocol(e.target.value)}
                          className={selectCls}
                        >
                          <option value="tcp">TCP</option>
                          <option value="udp">UDP</option>
                          <option value="tcp,udp">TCP+UDP</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAddOpen(false);
                      resetAddForm();
                    }}
                    className="border-slate-800 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddService}
                    disabled={!addValid || adding}
                    className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                  >
                    {adding && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    Deploy
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Edit Dialog ── */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-white">
            <DialogHeader>
              <DialogTitle>Edit Service</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Domain</Label>
                <Input
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">
                    Forward Host
                  </Label>
                  <Input
                    value={editForwardHost}
                    onChange={(e) => setEditForwardHost(e.target.value)}
                    className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">
                    Forward Port
                  </Label>
                  <Input
                    type="number"
                    value={editForwardPort}
                    onChange={(e) => setEditForwardPort(e.target.value)}
                    className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">
                    Forward Scheme
                  </Label>
                  <select
                    value={editForwardScheme}
                    onChange={(e) => setEditForwardScheme(e.target.value)}
                    className={selectCls}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editTlsEnabled}
                      onCheckedChange={setEditTlsEnabled}
                    />
                    <Label className="text-xs text-slate-400">
                      Auto TLS
                    </Label>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditOpen(false)}
                className="border-slate-800 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEditSave}
                disabled={editSaving}
                className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {editSaving && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirmation ── */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent className="border-slate-800 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Service
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                This will remove the Caddy proxy host for{" "}
                <span className="font-medium text-white">
                  {deleteHost?.domain}
                </span>
                . This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-slate-800">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-rose-600 text-white hover:bg-rose-500"
              >
                {deleting && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}
