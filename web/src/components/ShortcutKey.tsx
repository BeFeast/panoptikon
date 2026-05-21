"use client";

import { useEffect, useState } from "react";

export function ShortcutKey({ actionKey }: { actionKey: string }) {
  const [modifier, setModifier] = useState("Ctrl");

  useEffect(() => {
    if (/(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)) {
      setModifier("⌘");
    }
  }, []);

  return (
    <>
      {modifier}
      {modifier === "⌘" ? "" : "+"}
      {actionKey.toUpperCase()}
    </>
  );
}
