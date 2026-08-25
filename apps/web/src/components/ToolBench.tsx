import { useMemo, useState } from "react";
import { TOOL_IDS, type KnownToolId } from "@call-agent/contracts";
import {
  TOOL_BY_ID,
  TOOL_COPY,
  TOOL_GROUPS,
  describeProfile,
  toolChip,
  type ToolCopy,
  type ToolGroupId,
} from "../data/solutions";

type GroupFilter = "all" | ToolGroupId;

export function ToolCatalog({
  initialId,
}: {
  initialId?: KnownToolId;
}) {
  const [group, setGroup] = useState<GroupFilter>("all");
  const [selectedId, setSelectedId] = useState<KnownToolId>(
    initialId ?? TOOL_IDS.endCall,
  );

  const selected = TOOL_BY_ID[selectedId] ?? TOOL_BY_ID[TOOL_IDS.endCall];

  const setGroupAndFocus = (next: GroupFilter) => {
    setGroup(next);
    if (next === "all") return;
    const first = TOOL_COPY.find((t) => t.group === next);
    if (first) setSelectedId(first.id);
  };

  return (
    <div className="sol-inventory">
      <div className="sol-inventory-filters" role="tablist" aria-label="Tool groups">
        <button
          type="button"
          role="tab"
          aria-selected={group === "all"}
          className={`sol-filter${group === "all" ? " is-active" : ""}`}
          onClick={() => setGroupAndFocus("all")}
        >
          All
        </button>
        {TOOL_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={group === g.id}
            className={`sol-filter${group === g.id ? " is-active" : ""}`}
            onClick={() => setGroupAndFocus(g.id)}
          >
            {g.title}
          </button>
        ))}
      </div>
      <div className="sol-inventory-cloud" role="list" aria-label="Tools">
        {TOOL_COPY.map((tool) => {
          const dim = group !== "all" && tool.group !== group;
          const on = selected.id === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              role="listitem"
              className={`sol-cloud-btn${on ? " is-active" : ""}${dim && !on ? " is-dim" : ""}`}
              aria-current={on ? "true" : undefined}
              onClick={() => setSelectedId(tool.id)}
            >
              {toolChip(tool.id)}
            </button>
          );
        })}
      </div>
      <ToolDetail tool={selected} />
    </div>
  );
}

function ToolDetail({ tool }: { tool: ToolCopy }) {
  return (
    <article className="sol-detail" aria-live="polite">
      <div className="sol-detail-top">
        <p className="sol-detail-id">{toolChip(tool.id)}</p>
        <h3 className="sol-detail-title">{tool.label}</h3>
      </div>
      <div className="sol-detail-copy">
        <p className="sol-detail-does" title={tool.accomplishes}>
          {tool.accomplishes}
        </p>
        <p className="sol-detail-scene" title={tool.scene}>
          {tool.scene}
        </p>
      </div>
    </article>
  );
}

export function ProfileComposer({
  initialIds,
  title,
  lead,
  headingId,
  compact = false,
}: {
  initialIds: KnownToolId[];
  title: string;
  lead: string;
  headingId?: string;
  compact?: boolean;
}) {
  const [ids, setIds] = useState<Set<KnownToolId>>(() => new Set(initialIds));

  const sentence = useMemo(() => describeProfile([...ids]), [ids]);

  const toggle = (id: KnownToolId) => {
    if (id === TOOL_IDS.endCall) return;
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      next.add(TOOL_IDS.endCall);
      return next;
    });
  };

  return (
    <div className={`sol-composer${compact ? " is-compact" : ""}`}>
      <div className="sol-composer-copy">
        <p className="sol-kicker">Your mix</p>
        <h2 id={headingId}>{title}</h2>
        <p className="sol-lead">{lead}</p>
      </div>
      <div className="sol-composer-board">
        <div className="sol-chip-row" role="group" aria-label="Enabled tools">
          {TOOL_COPY.map((tool) => {
            const on = ids.has(tool.id);
            const locked = tool.id === TOOL_IDS.endCall;
            return (
              <button
                key={tool.id}
                type="button"
                className={`sol-stamp${on ? " is-on" : ""}${locked ? " is-locked" : ""}`}
                aria-pressed={on}
                disabled={locked}
                title={locked ? "Always included" : tool.label}
                onClick={() => toggle(tool.id)}
              >
                {toolChip(tool.id)}
              </button>
            );
          })}
        </div>
        <p className="sol-composer-sentence" title={sentence}>
          {sentence}
        </p>
        <p className="sol-composer-note">
          Hangup is always on. Unknown ids are skipped. You pick known tools — you do not
          upload code or JSON schemas.
        </p>
      </div>
    </div>
  );
}

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
