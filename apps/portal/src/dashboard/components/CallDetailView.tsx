import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert, LiveDot } from "@call-agent/ui";
import type { CallRecord } from "../../lib/api";
import { formatDateTime, formatRelative, shortId } from "../../lib/format";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";

type Props = {
  call: CallRecord;
  callsHref: string;
  batchHref?: (id: string) => string;
  agentHref?: (id: string) => string;
  orgHref?: (id: string) => string;
  actions?: ReactNode;
};

type ToolEventView = {
  toolId: string;
  at?: string;
  ok?: boolean;
  error?: string;
  summary?: string;
  durationMs?: number;
  args?: unknown;
  result?: unknown;
};

type Fact = { label: string; value: string };

export function CallDetailView({
  call,
  callsHref,
  batchHref,
  agentHref,
  orgHref,
  actions,
}: Props) {
  const transcript = call.transcript ?? [];
  const toolEvents = resolveToolEvents(call);
  const context = asRecord(call.context);
  const partyFacts = contextFacts(context);
  const outcomeFacts = resultFacts(call.taskResult);
  const live = isLive(call.status);
  const task = taskPresentation(call);
  const duration = callDuration(call);
  const party = partyTitle(call);
  const subtitle = heroSubtitle(call, context, duration);

  return (
    <div className={`ops-call${live ? " is-live" : ""}`}>
      <Link to={callsHref} className="ops-call-back">
        ← All calls
      </Link>

      <div className="ops-call-hero">
        <PageHeader
          eyebrow={`${call.medium.toUpperCase()} · ${call.direction.toUpperCase()}`}
          title={party}
          description={subtitle}
          actions={
            <div className="ops-call-hero-actions">
              {live ? <LiveDot badge>Live</LiveDot> : null}
              <StatusBadge status={call.status} />
              {actions}
            </div>
          }
        />
      </div>

      <ul className="ops-call-facts">
        <li>
          <span>Task</span>
          <strong>
            <StatusBadge status={task.status} label={task.label} />
          </strong>
        </li>
        <li>
          <span>Workflow</span>
          <strong className="ops-mono">{call.taskKey || "—"}</strong>
        </li>
        <li>
          <span>Try</span>
          <strong className="ops-mono">
            {call.attemptCount}/{call.maxAttempts}
          </strong>
        </li>
        <li>
          <span>Length</span>
          <strong>{duration}</strong>
        </li>
        <li>
          <span>When</span>
          <strong>
            <time dateTime={call.createdAt}>{formatRelative(call.createdAt)}</time>
          </strong>
        </li>
      </ul>

      {call.errorMessage || call.lastFailureCode ? (
        <Alert tone={call.status === "failed" ? "error" : "warn"}>
          <span className="ops-call-alert">
            {call.lastFailureCode ? (
              <span className="ops-mono">{call.lastFailureCode}</span>
            ) : (
              <span>Call issue</span>
            )}
            {call.errorMessage ? <span>{call.errorMessage}</span> : null}
          </span>
        </Alert>
      ) : null}

      <div className="ops-call-board">
        <section className="ops-panel ops-call-talk">
          <div className="ops-panel-head">
            <h2>Conversation</h2>
            <span className="ops-faint">
              {transcript.length} turn{transcript.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="ops-panel-body ops-call-talk-body">
            {transcript.length === 0 ? (
              <p className="ops-muted ops-call-empty">
                {live || call.status === "pending"
                  ? "No transcript yet. It appears after the worker completes the call."
                  : "No transcript was recorded for this call."}
              </p>
            ) : (
              <div className="ops-transcript ops-call-transcript">
                {transcript.map((row, i) => {
                  const role = mapTranscriptRole(row.role);
                  return (
                    <div
                      key={row.createdAt?.toString() ?? i}
                      className={`ops-transcript-row${role.agent ? " is-agent" : ""}`}
                    >
                      <span className="ops-transcript-role">{role.label}</span>
                      <p className="ops-transcript-text">{row.content}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="ops-call-rail">
          <section className="ops-panel ops-call-party">
            <div className="ops-panel-head">
              <h2>Party</h2>
              {typeof context?.source === "string" ? (
                <span className="ops-faint ops-mono">{context.source}</span>
              ) : null}
            </div>
            <div className="ops-panel-body">
              {partyFacts.length === 0 ? (
                <p className="ops-muted ops-call-empty">No request context stored for this call.</p>
              ) : (
                <dl className="ops-detail-grid ops-call-party-grid">
                  {partyFacts.map((f) => (
                    <div key={f.label} className="ops-detail-item">
                      <dt>{f.label}</dt>
                      <dd className="ops-mono">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {context ? (
                <details className="ops-call-json">
                  <summary>Raw context</summary>
                  <pre className="ops-prompt">{JSON.stringify(context, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          </section>

          {call.taskResult ? (
            <section className="ops-panel ops-call-outcome">
              <div className="ops-panel-head">
                <h2>Outcome</h2>
              </div>
              <div className="ops-panel-body">
                {outcomeFacts.length > 0 ? (
                  <dl className="ops-detail-grid ops-call-party-grid">
                    {outcomeFacts.map((f) => (
                      <div key={f.label} className="ops-detail-item">
                        <dt>{f.label}</dt>
                        <dd className="ops-mono">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {hasNested(call.taskResult) || outcomeFacts.length === 0 ? (
                  <details className="ops-call-json" open={outcomeFacts.length === 0}>
                    <summary>Task result</summary>
                    <pre className="ops-prompt">{JSON.stringify(call.taskResult, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="ops-panel ops-call-tools">
        <div className="ops-panel-head">
          <h2>Tools</h2>
          <span className="ops-faint">
            {toolEvents.length} call{toolEvents.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="ops-panel-body">
          {toolEvents.length === 0 ? (
            <p className="ops-muted ops-call-empty">
              {call.status === "completed" ||
              call.status === "incomplete" ||
              call.status === "failed"
                ? "No tool invocations were recorded for this call."
                : "No tool invocations yet. They appear after the worker completes the call."}
            </p>
          ) : (
            <ol className="ops-call-tool-list">
              {toolEvents.map((ev, i) => (
                <ToolEventCard key={`${ev.toolId}-${ev.at ?? i}`} ev={ev} />
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="ops-panel ops-call-plumb">
        <div className="ops-panel-head">
          <h2>Plumbing</h2>
          <span className="ops-faint ops-mono">{shortId(call.id, 8)}</span>
        </div>
        <div className="ops-panel-body">
          <dl className="ops-detail-grid">
            <div className="ops-detail-item">
              <dt>Call id</dt>
              <dd className="ops-mono ops-call-id">{call.id}</dd>
            </div>
            <div className="ops-detail-item">
              <dt>To</dt>
              <dd className="ops-mono">{call.toNumber || "—"}</dd>
            </div>
            <div className="ops-detail-item">
              <dt>From</dt>
              <dd className="ops-mono">{call.fromNumber || "—"}</dd>
            </div>
            <div className="ops-detail-item">
              <dt>Room</dt>
              <dd className="ops-mono">{call.roomName || "Not created yet"}</dd>
            </div>
            {call.batchId ? (
              <div className="ops-detail-item">
                <dt>Batch</dt>
                <dd>
                  {batchHref ? (
                    <Link to={batchHref(call.batchId)} className="ops-mono">
                      {shortId(call.batchId, 8)}
                    </Link>
                  ) : (
                    <span className="ops-mono">{shortId(call.batchId, 8)}</span>
                  )}
                </dd>
              </div>
            ) : null}
            {call.organizationAgentId ? (
              <div className="ops-detail-item">
                <dt>Agent</dt>
                <dd>
                  {agentHref ? (
                    <Link to={agentHref(call.organizationAgentId)} className="ops-mono">
                      {shortId(call.organizationAgentId, 8)}
                    </Link>
                  ) : (
                    <span className="ops-mono">{shortId(call.organizationAgentId, 8)}</span>
                  )}
                </dd>
              </div>
            ) : null}
            {call.organizationId ? (
              <div className="ops-detail-item">
                <dt>Org</dt>
                <dd>
                  {orgHref ? (
                    <Link to={orgHref(call.organizationId)} className="ops-mono">
                      {shortId(call.organizationId, 8)}
                    </Link>
                  ) : (
                    <span className="ops-mono">{shortId(call.organizationId, 8)}</span>
                  )}
                </dd>
              </div>
            ) : null}
            <div className="ops-detail-item">
              <dt>Priority</dt>
              <dd>{call.priority ?? 0}</dd>
            </div>
            <div className="ops-detail-item">
              <dt>Created</dt>
              <dd>{formatDateTime(call.createdAt)}</dd>
            </div>
            {call.startedAt ? (
              <div className="ops-detail-item">
                <dt>Started</dt>
                <dd>{formatDateTime(call.startedAt)}</dd>
              </div>
            ) : null}
            {call.answeredAt ? (
              <div className="ops-detail-item">
                <dt>Answered</dt>
                <dd>{formatDateTime(call.answeredAt)}</dd>
              </div>
            ) : null}
            {call.endedAt ? (
              <div className="ops-detail-item">
                <dt>Ended</dt>
                <dd>{formatDateTime(call.endedAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>
    </div>
  );
}

function ToolEventCard({ ev }: { ev: ToolEventView }) {
  const failed = ev.ok === false;
  return (
    <li className={`ops-call-tool${failed ? " is-fail" : ev.ok ? " is-ok" : ""}`}>
      <div className="ops-call-tool-head">
        <span className="ops-mono ops-call-tool-id">{ev.toolId}</span>
        <StatusBadge
          status={failed ? "failed" : ev.ok ? "completed" : "pending"}
          label={failed ? "fail" : ev.ok ? "ok" : "—"}
        />
        {ev.durationMs != null ? (
          <span className="ops-faint ops-mono">{formatDuration(ev.durationMs)}</span>
        ) : null}
        {ev.at ? (
          <time className="ops-call-tool-when" dateTime={ev.at}>
            {formatDateTime(ev.at)}
          </time>
        ) : null}
      </div>
      {ev.summary ? <p className="ops-call-tool-summary">{ev.summary}</p> : null}
      {ev.error ? <p className="ops-call-tool-error">{ev.error}</p> : null}
      {ev.args != null ? (
        <details className="ops-call-json">
          <summary>Args</summary>
          <pre className="ops-prompt">{JSON.stringify(ev.args, null, 2)}</pre>
        </details>
      ) : null}
      {ev.result != null ? (
        <details className="ops-call-json">
          <summary>Result</summary>
          <pre className="ops-prompt">{JSON.stringify(ev.result, null, 2)}</pre>
        </details>
      ) : null}
    </li>
  );
}

function partyTitle(call: CallRecord): string {
  if (call.medium === "web") {
    return call.toNumber || call.fromNumber || call.participantIdentity || "Web test";
  }
  if (call.direction === "inbound") {
    return call.fromNumber || call.participantIdentity || "Unknown caller";
  }
  return call.toNumber || call.participantIdentity || "Unknown number";
}

function heroSubtitle(
  call: CallRecord,
  context: Record<string, unknown> | null,
  duration: string,
): string {
  const parts: string[] = [];
  const name = personName(context);
  const company = scalar(context?.company);
  if (name) parts.push(name);
  if (company && company !== name) parts.push(company);
  if (call.taskKey) parts.push(call.taskKey.replace(/_/g, " "));
  if (duration && duration !== "—") parts.push(duration);
  parts.push(shortId(call.id, 8));
  return parts.join(" · ");
}

function personName(context: Record<string, unknown> | null): string | null {
  if (!context) return null;
  const first = scalar(context.firstName);
  const last = scalar(context.lastName);
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || scalar(context.name);
}

function contextFacts(context: Record<string, unknown> | null): Fact[] {
  if (!context) return [];
  const facts: Fact[] = [];
  const name = personName(context);
  if (name) facts.push({ label: "Name", value: name });
  pushFact(facts, context, "company", "Company");
  pushFact(facts, context, "email", "Email");
  pushFact(facts, context, "phoneNumber", "Phone");
  if (!facts.some((f) => f.label === "Phone")) {
    pushFact(facts, context, "phone", "Phone");
  }
  pushFact(facts, context, "externalId", "External id");
  pushFact(facts, context, "source", "Source");
  return facts;
}

function pushFact(
  facts: Fact[],
  record: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = formatScalar(record[key]);
  if (value) facts.push({ label, value });
}

function resultFacts(result: Record<string, unknown> | null): Fact[] {
  if (!result) return [];
  const facts: Fact[] = [];
  for (const [key, raw] of Object.entries(result)) {
    const value = formatScalar(raw);
    if (value) facts.push({ label: humanKey(key), value });
  }
  return facts;
}

function hasNested(result: Record<string, unknown>): boolean {
  return Object.values(result).some((v) => {
    if (v == null) return false;
    if (typeof v === "object") {
      if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number")) {
        return false;
      }
      return true;
    }
    return false;
  });
}

function taskPresentation(call: CallRecord): { status: string; label: string } {
  if (call.taskStatus === "completed" || call.status === "completed") {
    return { status: "completed", label: "Completed" };
  }
  if (call.taskStatus === "incomplete") {
    return { status: "incomplete", label: "Not completed" };
  }
  return { status: call.taskStatus ?? "pending", label: "Pending" };
}

function isLive(status: string): boolean {
  return status === "creating" || status === "dialing" || status === "ready";
}

function callDuration(call: CallRecord): string {
  const startIso = call.answeredAt || call.startedAt;
  const endIso = call.endedAt;
  if (startIso && endIso) {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (Number.isFinite(ms) && ms >= 0) return formatDuration(ms);
  }
  if (isLive(call.status)) return "In progress";
  if (call.status === "pending") return "Queued";
  if (
    !call.answeredAt &&
    (call.status === "failed" ||
      call.status === "cancelled" ||
      call.lastFailureCode === "no_answer")
  ) {
    return "Not answered";
  }
  return "—";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function mapTranscriptRole(role: string | undefined): { label: string; agent: boolean } {
  const r = (role || "").toLowerCase();
  if (r.includes("agent") || r.includes("assistant") || r === "ai") {
    return { label: "Agent", agent: true };
  }
  if (r === "system") return { label: "System", agent: false };
  return { label: "Callee", agent: false };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.keys(value).length > 0 ? (value as Record<string, unknown>) : null;
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function formatScalar(value: unknown): string | null {
  const simple = scalar(value);
  if (simple) return simple;
  if (Array.isArray(value) && value.every((x) => typeof x === "string" || typeof x === "number")) {
    const joined = value.map(String).filter(Boolean).join(", ");
    return joined || null;
  }
  return null;
}

function humanKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function resolveToolEvents(data: CallRecord): ToolEventView[] {
  const fromTop = data.toolEvents;
  if (Array.isArray(fromTop) && fromTop.length > 0) {
    return fromTop.map(normalizeToolEvent).filter((x): x is ToolEventView => x != null);
  }
  return extractToolEvents(data.sessionReport);
}

function extractToolEvents(
  sessionReport: Record<string, unknown> | null | undefined,
): ToolEventView[] {
  if (!sessionReport || typeof sessionReport !== "object") return [];
  const raw = sessionReport.toolEvents;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeToolEvent).filter((x): x is ToolEventView => x != null);
}

function normalizeToolEvent(item: unknown): ToolEventView | null {
  if (!item || typeof item !== "object") return null;
  const e = item as Record<string, unknown>;
  const toolId = typeof e.toolId === "string" ? e.toolId : null;
  if (!toolId) return null;
  return {
    toolId,
    at: typeof e.at === "string" ? e.at : undefined,
    ok: typeof e.ok === "boolean" ? e.ok : undefined,
    error: typeof e.error === "string" ? e.error : undefined,
    summary: typeof e.summary === "string" ? e.summary : undefined,
    durationMs: typeof e.durationMs === "number" ? e.durationMs : undefined,
    args: e.args,
    result: e.result,
  };
}
