"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/PageTransition";
import {
  fetchCaddyStatus,
  testCaddyConnection,
  fetchSettings,
  updateSettings,
} from "@/lib/api";
import type { CaddyStatus } from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";

export default function CaddySettingsPage() {
  const [caddyStatus, setCaddyStatus] = useState<CaddyStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [adminUrl, setAdminUrl] = useState("http://localhost:2019");
  const [savedAdminUrl, setSavedAdminUrl] = useState("http://localhost:2019");
  const [savingUrl, setSavingUrl] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statusData, settingsData] = await Promise.all([
        fetchCaddyStatus(),
        fetchSettings(),
      ]);
      setCaddyStatus(statusData);
      const url = settingsData.caddy_admin_url || "http://localhost:2019";
      setAdminUrl(url);
      setSavedAdminUrl(url);
    } catch {
      toast.error("Failed to load Caddy settings");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleTestConnection() {
    setTesting(true);
    try {
      const result = await testCaddyConnection();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      const statusData = await fetchCaddyStatus();
      setCaddyStatus(statusData);
    } catch {
      toast.error("Failed to test connection");
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveUrl() {
    setSavingUrl(true);
    try {
      await updateSettings({ caddy_admin_url: adminUrl.trim() });
      setSavedAdminUrl(adminUrl.trim());
      toast.success("Caddy admin URL saved");
    } catch {
      toast.error("Failed to save admin URL");
    } finally {
      setSavingUrl(false);
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold text-white">
              Caddy Configuration
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {caddyStatus && (
              <Badge
                variant="outline"
                className={
                  caddyStatus.reachable
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-rose-500/30 text-rose-400"
                }
              >
                {caddyStatus.reachable ? (
                  <CheckCircle className="mr-1 h-3 w-3" />
                ) : (
                  <AlertCircle className="mr-1 h-3 w-3" />
                )}
                {caddyStatus.reachable ? "Connected" : "Unreachable"}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              {testing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test Connection
            </Button>
          </div>
        </div>

        {/* Admin URL Configuration */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white">
              Caddy Admin API
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              URL of the Caddy admin endpoint used to push proxy config.
              Manage proxy hosts from the{" "}
              <Link href="/proxy" className="text-blue-400 hover:underline">
                Proxy
              </Link>{" "}
              page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="admin-url" className="text-xs text-slate-400">
                  Admin URL
                </Label>
                <Input
                  id="admin-url"
                  value={adminUrl}
                  onChange={(e) => setAdminUrl(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="http://localhost:2019"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveUrl}
                disabled={savingUrl || adminUrl.trim() === savedAdminUrl}
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                {savingUrl && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
