"use client";

import {
  Battery,
  Box,
  CircuitBoard,
  Container,
  Gamepad2,
  HardDrive,
  HelpCircle,
  Laptop,
  Monitor,
  Network,
  Printer,
  Router,
  Server,
  Smartphone,
  Tablet,
  Tv,
  Wifi,
} from "lucide-react";
import type { DeviceType } from "@/lib/device-type";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<DeviceType, typeof Router> = {
  router: Router,
  access_point: Wifi,
  laptop: Laptop,
  desktop: Monitor,
  phone: Smartphone,
  tablet: Tablet,
  tv: Tv,
  server: Server,
  printer: Printer,
  iot: CircuitBoard,
  gaming: Gamepad2,
  workstation: Monitor,
  vm: Box,
  container: Container,
  nas: HardDrive,
  switch: Network,
  ups: Battery,
  other: HelpCircle,
  unknown: HelpCircle,
};

const COLOR_MAP: Record<DeviceType, string> = {
  router: "text-blue-400",
  access_point: "text-cyan-300",
  laptop: "text-sky-400",
  desktop: "text-indigo-400",
  phone: "text-violet-400",
  tablet: "text-purple-400",
  tv: "text-pink-400",
  server: "text-emerald-400",
  printer: "text-amber-400",
  iot: "text-teal-400",
  gaming: "text-rose-400",
  workstation: "text-indigo-400",
  vm: "text-cyan-400",
  container: "text-orange-400",
  nas: "text-lime-400",
  switch: "text-blue-300",
  ups: "text-yellow-400",
  other: "text-slate-400",
  unknown: "text-slate-400",
};

interface DeviceTypeIconProps {
  type: DeviceType;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function DeviceTypeIcon({ type, size = "md", className }: DeviceTypeIconProps) {
  const Icon = ICON_MAP[type];
  const color = COLOR_MAP[type];

  return <Icon className={cn(SIZE_MAP[size], color, className)} />;
}

export function DeviceTypeLabel({ type }: { type: DeviceType }) {
  const labels: Record<DeviceType, string> = {
    router: "Router",
    access_point: "Access Point",
    laptop: "Laptop",
    desktop: "Desktop",
    phone: "Phone",
    tablet: "Tablet",
    tv: "TV",
    server: "Server",
    printer: "Printer",
    iot: "IoT",
    gaming: "Gaming",
    workstation: "Workstation",
    vm: "VM",
    container: "Container",
    nas: "NAS",
    switch: "Switch",
    ups: "UPS",
    other: "Other",
    unknown: "Unknown",
  };
  return <span className="text-xs text-slate-500 capitalize">{labels[type]}</span>;
}
