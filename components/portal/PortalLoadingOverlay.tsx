type PortalLoadingOverlayProps = {
  active: boolean;
  label?: string;
};

export function PortalLoadingOverlay({
  active,
  label = "読み込み中...",
}: PortalLoadingOverlayProps) {
  if (!active) {
    return null;
  }

  return (
    <div
      className="portalLoadingOverlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="portalLoadingSpinner" aria-hidden="true" />
      <span className="portalLoadingLabel">{label}</span>
    </div>
  );
}
