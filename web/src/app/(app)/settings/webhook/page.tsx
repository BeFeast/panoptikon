"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function WebhookSettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savedWebhookUrl, setSavedWebhookUrl] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<Status>("idle");
  const [webhookMsg, setWebhookMsg] = useState("");
  const [testStatus, setTestStatus] = useState<Status>("idle");
  const [testMsg, setTestMsg] = useState("");

  const settingsLoadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: { webhook_url: string | null }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          setWebhookUrl(data.webhook_url ?? "");
          setSavedWebhookUrl(data.webhook_url ?? null);
        }
      )
      .catch(() => {});
  }, []);

  const webhookDirty = webhookUrl !== (savedWebhookUrl ?? "");

  // Inline validation
  const urlValid =
    webhookUrl.length === 0
      ? "idle"
      : /^https?:\/\/.+/.test(webhookUrl)
        ? "valid"
        : "error";

  async function handleWebhookSave() {
    settingsLoadTokenRef.current++;
    setWebhookStatus("loading");
    setWebhookMsg("");
    try {
      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: webhookUrl }),
        credentials: "include",
      });
      if (res.ok) {
        const data: { webhook_url: string | null } = await res.json();
        setSavedWebhookUrl(data.webhook_url ?? null);
        setWebhookUrl(data.webhook_url ?? "");
        setWebhookStatus("success");
        setWebhookMsg("Webhook URL saved.");
        setTimeout(() => setWebhookStatus("idle"), 3000);
      } else {
        setWebhookStatus("error");
        setWebhookMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setWebhookStatus("error");
      setWebhookMsg("Network error.");
    }
  }

  async function handleWebhookTest() {
    setTestStatus("loading");
    setTestMsg("");
    try {
      const res = await fetch("/api/v1/settings/test-webhook", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 204) {
        setTestStatus("success");
        setTestMsg("Test webhook sent!");
        setTimeout(() => setTestStatus("idle"), 3000);
      } else if (res.status === 400) {
        setTestStatus("error");
        setTestMsg("No webhook URL configured. Save one first.");
      } else {
        setTestStatus("error");
        setTestMsg(`Failed (${res.status}).`);
      }
    } catch {
      setTestStatus("error");
      setTestMsg("Network error.");
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
          <h1 className="text-2xl font-semibold tracking-tight text-white">Webhook Notifications</h1>
        </div>

        <SettingsSection
          icon={<Bell className="h-4 w-4 text-[#c084fc]" />}
          iconBg="bg-[#c084fc]/10"
          title="Webhook Configuration"
          description="POST alert payloads to Discord, Slack, ntfy.sh, or any URL."
        >
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url" className="text-xs text-mesh-text-dim">
              Webhook URL
            </Label>
            <div className="relative">
              <Input
                id="webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className={`border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                  urlValid === "valid"
                    ? "border-[#4ade80]/40"
                    : urlValid === "error"
                      ? "border-[#fb7185]/40"
                      : ""
                }`}
                placeholder="https://ntfy.sh/my-topic or Discord webhook URL"
              />
              {urlValid === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                </div>
              )}
            </div>
            {urlValid === "error" && (
              <p className="animate-fade-in text-xs text-[#fb7185]">Enter a valid URL (http:// or https://).</p>
            )}
          </div>

          {webhookStatus === "success" && webhookMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
              <p className="text-xs text-[#4ade80]">{webhookMsg}</p>
            </div>
          )}
          {webhookStatus === "error" && webhookMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{webhookMsg}</p>
            </div>
          )}
          {testStatus === "success" && testMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
              <p className="text-xs text-[#4ade80]">{testMsg}</p>
            </div>
          )}
          {testStatus === "error" && testMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{testMsg}</p>
            </div>
          )}

          <div className="flex gap-2">
            <SaveButton
              status={webhookStatus}
              disabled={!webhookDirty}
              onClick={handleWebhookSave}
            />
            <Button
              variant="outline"
              onClick={handleWebhookTest}
              disabled={!savedWebhookUrl || testStatus === "loading"}
              className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55 disabled:opacity-40"
            >
              {testStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test
            </Button>
          </div>
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
