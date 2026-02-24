"use client";

import { useEffect, useRef, useState } from "react";
import {
  Settings,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function AdvancedSettingsPage() {
  const [showLegacyRouters, setShowLegacyRouters] = useState(false);
  const [savedShowLegacyRouters, setSavedShowLegacyRouters] = useState(false);

  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMsg, setSaveMsg] = useState("");

  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++loadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then((data: { show_legacy_routers: boolean }) => {
        if (loadToken !== loadTokenRef.current) return;
        setShowLegacyRouters(data.show_legacy_routers ?? false);
        setSavedShowLegacyRouters(data.show_legacy_routers ?? false);
      })
      .catch(() => {});
  }, []);

  const dirty = showLegacyRouters !== savedShowLegacyRouters;

  async function handleSave() {
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ show_legacy_routers: showLegacyRouters }),
      });
      if (res.ok) {
        const data = await res.json();
        const newValue = data.show_legacy_routers ?? showLegacyRouters;
        setShowLegacyRouters(newValue);
        setSavedShowLegacyRouters(newValue);
        setSaveStatus("success");
        setSaveMsg("Settings saved.");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
        setSaveMsg("Failed to save settings.");
      }
    } catch {
      setSaveStatus("error");
      setSaveMsg("Network error.");
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
        >
          <ArrowLeft className="h-3 w-3" /> Settings
        </Link>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-slate-400" />
              <CardTitle>Advanced / Legacy</CardTitle>
            </div>
            <CardDescription>
              Options for legacy router integrations and advanced behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Show Legacy Routers toggle */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="show-legacy-routers" className="text-sm">
                  Show Legacy Routers
                </Label>
                <p className="text-xs text-slate-500">
                  When enabled, legacy router options (e.g. VyOS) are visible in
                  the UI. Disabled by default for new deployments.
                </p>
              </div>
              <Switch
                id="show-legacy-routers"
                checked={showLegacyRouters}
                onCheckedChange={setShowLegacyRouters}
              />
            </div>

            {/* Save button + status */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleSave}
                disabled={!dirty || saveStatus === "loading"}
                size="sm"
              >
                {saveStatus === "loading" && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save
              </Button>
              {saveStatus === "success" && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle className="h-3.5 w-3.5" /> {saveMsg}
                </span>
              )}
              {saveStatus === "error" && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" /> {saveMsg}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
