import { useEffect, useState } from "react";

const KEY = "valtis.ghost-mode";

export function useGhostMode() {
  const [ghost, setGhost] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" && localStorage.getItem(KEY);
    if (stored === "1") setGhost(true);
  }, []);

  const toggle = () => {
    setGhost((g) => {
      const next = !g;
      if (typeof window !== "undefined") localStorage.setItem(KEY, next ? "1" : "0");
      return next;
    });
  };

  return { ghost, toggle };
}

export function formatAmount(value: number, currency: string, ghost: boolean) {
  if (ghost) return "•••••• " + currency;
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}