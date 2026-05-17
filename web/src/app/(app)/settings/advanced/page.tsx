"use client";

import {
  Settings2,
  ArrowLeft,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";

export default function AdvancedSettingsPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-lg space-y-8 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-900/45 text-slate-400 transition-colors hover:bg-cyan-950/35 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Advanced</h1>
        </div>

        <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-500/10">
                <Settings2 className="h-4 w-4 text-slate-400" />
              </div>
              <div>
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Advanced Settings
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  No advanced settings are available at this time.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">
              Advanced configuration options will appear here as they become
              available.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
