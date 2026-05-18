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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addService,
  removeService,
  fetchCaddyProxyHosts,
  fetchCaddyStatus,
  fetchMikrotikStatus,
  toggleCaddyProxyHost,
  updateCaddyProxyHost,
} from "@/lib/api";
import type {
  AddServiceRequest,
  StepResult,
  CaddyProxyHost,
  CaddyStatus,
  MikrotikStatus,
} from "@/lib/types";

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
      <div className="mx-auto max-w-5xl space-y-8 py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="t-h1 text-white">Services</h1>
            <p className="mt-1 text-sm text-mesh-text-dim">
              Manage reverse proxy entries and port-forwarding rules
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status indicators */}
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-mesh-text-dim">
                    <Shield className="h-3.5 w-3.5" />
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        caddyStatus?.reachable
                          ? "bg-[#4ade80]"
                          : "bg-mesh-text-mute"
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
                  <div className="flex items-center gap-1.5 text-xs text-mesh-text-dim">
                    <Network className="h-3.5 w-3.5" />
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        mikrotikStatus?.configured &&
                        mikrotikStatus?.reachable
                          ? "bg-[#4ade80]"
                          : "bg-mesh-text-mute"
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
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Service
            </Button>
          </div>
        </div>

        {/* Services table */}
        <div className="mesh-card">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-12 w-full rounded-md bg-mesh-surface-1"
                />
              ))}
            </div>
          ) : hosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-mesh-text-mute">
              <Server className="mb-3 h-10 w-10" />
              <p className="text-sm">No services configured</p>
              <p className="mt-1 text-xs text-mesh-text-mute">
                Click &quot;Add Service&quot; to create your first reverse proxy
                entry
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-mesh-border-strong hover:bg-transparent">
                  <TableHead className="text-mesh-text-dim">Domain</TableHead>
                  <TableHead className="text-mesh-text-dim">Upstream</TableHead>
                  <TableHead className="text-mesh-text-dim">TLS</TableHead>
                  <TableHead className="text-mesh-text-dim">Status</TableHead>
                  <TableHead className="text-right text-mesh-text-dim">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.map((host) => (
                  <TableRow
                    key={host.id}
                    className="border-mesh-border-strong hover:bg-mesh-surface-2/55"
                  >
                    <TableCell className="max-w-[250px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="h-4 w-4 shrink-0 text-mesh-text-mute" />
                        <span className="truncate font-medium text-white">
                          {host.domain}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] text-mesh-text">
                      <span className="block truncate">
                        {host.forward_scheme}://{host.forward_host}:
                        {host.forward_port}
                      </span>
                    </TableCell>
                    <TableCell>
                      {host.tls_enabled ? (
                        <Badge
                          variant="outline"
                          className="border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]"
                        >
                          HTTPS
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-mesh-border-strong text-mesh-text-mute"
                        >
                          HTTP
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {host.enabled ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-[#4ade80]" />
                          <span className="text-xs text-[#4ade80]">
                            Enabled
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-mesh-text-mute" />
                          <span className="text-xs text-mesh-text-mute">
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
                              className="h-8 w-8 p-0 text-mesh-text-dim hover:text-white"
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
                              className="h-8 w-8 p-0 text-mesh-text-dim hover:text-white"
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
                              className="h-8 w-8 p-0 text-mesh-text-dim hover:text-[#fb7185]"
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
          <DialogContent className="max-w-md">
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
                        ? "border-[#4ade80]/30 bg-[#4ade80]/10"
                        : "border-[#fb7185]/30 bg-[#fb7185]/10"
                    }`}
                  >
                    {step.success ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4ade80]" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#fb7185]" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-medium ${
                          step.success ? "text-[#4ade80]" : "text-[#fb7185]"
                        }`}
                      >
                        {step.step.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-mesh-text-dim">{step.message}</p>
                    </div>
                  </div>
                ))}
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setAddOpen(false);
                      resetAddForm();
                    }}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              /* Form view */
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-mesh-text-dim">
                    Service Name
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My App"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-mesh-text-dim">
                      Internal IP
                    </Label>
                    <Input
                      value={internalIp}
                      onChange={(e) => setInternalIp(e.target.value)}
                      placeholder="10.10.0.50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-mesh-text-dim">
                      Internal Port
                    </Label>
                    <Input
                      type="number"
                      value={internalPort}
                      onChange={(e) => setInternalPort(e.target.value)}
                      placeholder="8080"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-mesh-text-dim">
                    Domain
                  </Label>
                  <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="myapp.oklabs.uk"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-mesh-text-dim">
                      Forward Scheme
                    </Label>
                    <Select
                      value={forwardScheme}
                      onValueChange={setForwardScheme}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http">HTTP</SelectItem>
                        <SelectItem value="https">HTTPS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end pb-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={tlsEnabled}
                        onCheckedChange={setTlsEnabled}
                      />
                      <Label className="text-xs text-mesh-text-dim">
                        Auto TLS (HTTPS)
                      </Label>
                    </div>
                  </div>
                </div>

                {/* MikroTik port-forward section — inner-tier surface */}
                <div className="mesh-card-2 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-mesh-text-mute" />
                      <Label className="text-xs text-mesh-text-dim">
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
                        <Label className="text-xs text-mesh-text-dim">
                          External Port
                        </Label>
                        <Input
                          type="number"
                          value={externalPort}
                          onChange={(e) => setExternalPort(e.target.value)}
                          placeholder="443"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-mesh-text-dim">
                          Protocol
                        </Label>
                        <Select
                          value={protocol}
                          onValueChange={setProtocol}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tcp">TCP</SelectItem>
                            <SelectItem value="udp">UDP</SelectItem>
                            <SelectItem value="tcp,udp">TCP+UDP</SelectItem>
                          </SelectContent>
                        </Select>
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
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddService}
                    disabled={!addValid || adding}
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Service</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-mesh-text-dim">Domain</Label>
                <Input
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-mesh-text-dim">
                    Forward Host
                  </Label>
                  <Input
                    value={editForwardHost}
                    onChange={(e) => setEditForwardHost(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-mesh-text-dim">
                    Forward Port
                  </Label>
                  <Input
                    type="number"
                    value={editForwardPort}
                    onChange={(e) => setEditForwardPort(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-mesh-text-dim">
                    Forward Scheme
                  </Label>
                  <Select
                    value={editForwardScheme}
                    onValueChange={setEditForwardScheme}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">HTTP</SelectItem>
                      <SelectItem value="https">HTTPS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-1">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editTlsEnabled}
                      onCheckedChange={setEditTlsEnabled}
                    />
                    <Label className="text-xs text-mesh-text-dim">
                      Auto TLS
                    </Label>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditSave} disabled={editSaving}>
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Service
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the Caddy proxy host for{" "}
                <span className="font-medium text-white">
                  {deleteHost?.domain}
                </span>
                . This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-[#fb7185] text-white hover:bg-[#fb7185]"
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
