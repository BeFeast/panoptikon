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
  router: "text-mesh-primary",
  access_point: "text-[#67e8f9]",
  laptop: "text-mesh-accent",
  desktop: "text-[#818cf8]",
  phone: "text-[#a78bfa]",
  tablet: "text-[#c084fc]",
  tv: "text-[#f472b6]",
  server: "text-[#4ade80]",
  printer: "text-[#fbbf24]",
  iot: "text-mesh-accent",
  gaming: "text-[#fb7185]",
  workstation: "text-[#818cf8]",
  vm: "text-mesh-accent",
  container: "text-[#fbbf24]",
  nas: "text-lime-400",
  switch: "text-mesh-primary",
  ups: "text-[#fbbf24]",
  other: "text-mesh-text-dim",
  unknown: "text-mesh-text-dim",
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
  return <span className="text-xs text-mesh-text-mute capitalize">{labels[type]}</span>;
}
