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
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight font-display text-white">Advanced</h1>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-500/10">
                <Settings2 className="h-4 w-4 text-slate-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
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
