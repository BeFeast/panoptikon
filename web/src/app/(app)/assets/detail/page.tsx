"use client";

import { Suspense } from "react";
import AssetDetailContent from "./content";

export default function AssetDetailPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-20 text-center">Loading...</div>}>
      <AssetDetailContent />
    </Suspense>
  );
}
