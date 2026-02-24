"use client";

import { useEffect, useRef, useState } from "react";
import {
  Settings2,
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
  const [showLegacy, setShowLegacy] = useState(false);
  const [savedShowLegacy, setSavedShowLegacy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++loadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then((data: { show_legacy_routers: boolean }) => {
        if (loadToken !== loadTokenRef.current) return;
        setShowLegacy(data.show_legacy_routers);
        setSavedShowLegacy(data.show_legacy_routers);
      })
      .catch(() => {});
  }, []);

  const dirty = showLegacy !== savedShowLegacy;

  async function handleSave() {
    loadTokenRef.current++;
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_legacy_routers: showLegacy }),
        credentials: "include",
      });
      if (res.ok) {
        const data: { show_legacy_routers: boolean } = await res.json();
        setShowLegacy(data.show_legacy_routers);
        setSavedShowLegacy(data.show_legacy_routers);
        setSaveStatus("success");
        setSaveMsg("Advanced settings saved.");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
        setSaveMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setSaveStatus("error");
      setSaveMsg("Network error.");
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
          <h1 className="text-2xl font-semibold text-white">Advanced</h1>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-500/10">
                <Settings2 className="h-4 w-4 text-slate-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Legacy Settings
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Control visibility of legacy router integrations.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="show-legacy-routers"
                  className="text-sm text-slate-300"
                >
                  Show legacy routers
                </Label>
                <p className="text-xs text-slate-500">
                  Display legacy router options (e.g. VyOS) in the sidebar and settings.
                </p>
              </div>
              <Switch
                id="show-legacy-routers"
                checked={showLegacy}
                onCheckedChange={setShowLegacy}
              />
            </div>

            {saveStatus === "success" && saveMsg && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">{saveMsg}</p>
              </div>
            )}
            {saveStatus === "error" && saveMsg && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-xs text-rose-400">{saveMsg}</p>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={!dirty || saveStatus === "loading"}
              className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {saveStatus === "loading" && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Save
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
