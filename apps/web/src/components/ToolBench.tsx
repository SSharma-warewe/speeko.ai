import type { KnownToolId } from "@call-agent/contracts";
import { toolChip } from "../data/solutions";

export function ToolIdChain({ ids }: { ids: KnownToolId[] }) {
  return (
    <ol className="sol-chain">
      {ids.map((id, idx) => (
        <li key={`${id}-${idx}`}>
          {idx > 0 ? <span className="sol-chain-arrow" aria-hidden>→</span> : null}
          <code>{toolChip(id)}</code>
        </li>
      ))}
    </ol>
  );
}
