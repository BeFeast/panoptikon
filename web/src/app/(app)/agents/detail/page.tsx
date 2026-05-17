"use client";

import { Suspense } from "react";
import AgentDetailContent from "./content";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AgentDetailContent />
    </Suspense>
  );
}
