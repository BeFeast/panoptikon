"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface SettingsSectionProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

export function SettingsSection({
  icon,
  iconBg,
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}
          >
            {icon}
          </div>
          <div>
            <CardTitle className="text-base text-white">{title}</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
