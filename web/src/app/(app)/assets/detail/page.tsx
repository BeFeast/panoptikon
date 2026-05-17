"use client";

import { Suspense } from "react";
import AssetDetailContent from "./content";
import { Skeleton } from "@/components/ui/skeleton";

export default function AssetDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AssetDetailContent />
    </Suspense>
  );
}
