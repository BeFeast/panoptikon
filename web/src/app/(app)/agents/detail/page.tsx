"use client";

import { Suspense } from "react";
import AgentDetailContent from "./content";

export default function AgentDetailPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-20 text-center">Loading…</div>}>
      <AgentDetailContent />
    </Suspense>
  );
}
