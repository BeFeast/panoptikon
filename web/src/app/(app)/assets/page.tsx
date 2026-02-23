"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AssetDetailContent from "./detail/content";

function AssetsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  useEffect(() => {
    // If no id provided, redirect to devices page
    if (!id) {
      router.replace("/devices");
    }
  }, [id, router]);

  if (!id) {
    return <div className="text-gray-500 py-20 text-center">Redirecting...</div>;
  }

  return <AssetDetailContent />;
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-20 text-center">Loading...</div>}>
      <AssetsPageInner />
    </Suspense>
  );
}
