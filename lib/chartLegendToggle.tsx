"use client";

import { useCallback, useState, type ReactNode } from "react";

export function useChartLegendToggle() {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());

  const isVisible = useCallback((key: string) => !hiddenKeys.has(key), [hiddenKeys]);

  const toggle = useCallback((key: string) => {
    setHiddenKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  return { isVisible, toggle };
}

type ChartLegendToggleButtonProps = {
  seriesKey: string;
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
  className: string;
  children: ReactNode;
};

export function ChartLegendToggleButton({
  seriesKey,
  isVisible,
  onToggle,
  className,
  children,
}: ChartLegendToggleButtonProps) {
  const visible = isVisible(seriesKey);

  return (
    <button
      type="button"
      className={`${className}${visible ? "" : " chartLegendItemHidden"}`}
      onClick={() => onToggle(seriesKey)}
      aria-pressed={visible}
      title={visible ? "クリックで非表示" : "クリックで表示"}
    >
      {children}
    </button>
  );
}
