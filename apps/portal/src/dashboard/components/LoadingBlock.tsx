import { Spinner } from "@call-agent/ui";

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div className="ops-state">
      <Spinner size="md" label={label} />
      <p className="ops-faint">{label}…</p>
    </div>
  );
}
