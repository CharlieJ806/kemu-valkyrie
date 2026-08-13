"use client";

import { useEffect } from "react";
import { useGameStore } from "@/lib/store";

export default function Toast() {
  const toast = useGameStore((s) => s.toast);
  const clearToast = useGameStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => clearToast(), toast.ms);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  return (
    <div id="toast" className={toast ? "show" : ""}>
      {toast?.message ?? ""}
    </div>
  );
}
