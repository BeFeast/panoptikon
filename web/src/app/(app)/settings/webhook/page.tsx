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
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/settings-section";
import { ValidatedInput } from "@/components/settings/validated-input";
import { SaveButton } from "@/components/settings/save-button";
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
  const urlValid =
    webhookUrl === "" ? "idle" : /^https?:\/\/.+/.test(webhookUrl) ? "valid" : "invalid";

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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-white">Webhook Notifications</h1>
        </div>

        <SettingsSection
          icon={<Bell className="h-4 w-4 text-purple-400" />}
          iconBg="bg-purple-500/10"
          title="Webhook Configuration"
          description="POST alert payloads to Discord, Slack, ntfy.sh, or any URL."
        >
          <ValidatedInput
            inputId="webhook-url"
            label="Webhook URL"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://ntfy.sh/my-topic or Discord webhook URL"
            validationState={urlValid as "idle" | "valid" | "invalid"}
            error="Enter a valid URL (http:// or https://)"
          />

          {webhookStatus === "success" && webhookMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{webhookMsg}</p>
            </div>
          )}
          {webhookStatus === "error" && webhookMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{webhookMsg}</p>
            </div>
          )}
          {testStatus === "success" && testMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{testMsg}</p>
            </div>
          )}
          {testStatus === "error" && testMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{testMsg}</p>
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
              className="border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
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
