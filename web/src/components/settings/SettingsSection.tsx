"use client";

import { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface SettingsSectionProps {
  icon: ReactNode;
  iconBg: string;
  title: string;
  description?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({
  icon,
  iconBg,
  title,
  description,
  headerRight,
  children,
}: SettingsSectionProps) {
  return (
    <Card className="border-mesh-border bg-mesh-surface-1" data-testid="settings-section">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base text-white">{title}</CardTitle>
            {description && (
              <CardDescription className="text-xs text-mesh-text-mute">
                {description}
              </CardDescription>
            )}
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
