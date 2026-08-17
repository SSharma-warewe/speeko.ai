import { Link, useParams } from "react-router-dom";
import { getCall, type CallRecord } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

export default function CallDetailPage() {
  const { id = "" } = useParams();
  const { data, error, loading, reload } = useAsync(() => getCall(id), [id]);

  if (loading) return <LoadingBlock label="Loading call" />;
  if (error || !data) return <ErrorBlock message={error ?? "Not found"} onRetry={reload} />;

  const transcript = data.transcript ?? [];
  const toolEvents = resolveToolEvents(data);
  const context = data.context ?? null;
  const hasContext =
    context != null && typeof context === "object" && Object.keys(context).length > 0;

  return (
    <div className="ops-stack">
      <p style={{ margin: 0 }}>
        <Link to="/admin-dashboard/calls" className="ops-muted">
          ← All calls
        </Link>
      </p>

      <PageHeader
        eyebrow={data.medium.toUpperCase()}
        title="Call detail"
        description={data.roomName ? `Room ${data.roomName}` : "Room not created yet"}
        actions={<StatusBadge status={data.status} />}
      />

      <div className="ops-two-col">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Metadata</h2>
          </div>
          <div className="ops-panel-body">
            <dl className="ops-detail-grid">
              <div className="ops-detail-item">
                <dt>ID</dt>
                <dd className="ops-mono">{data.id}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Direction</dt>
                <dd>
                  <StatusBadge status={data.direction} />
                </dd>
              </div>
              <div className="ops-detail-item">
                <dt>To</dt>
                <dd className="ops-mono">{data.toNumber || "—"}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>From</dt>
                <dd className="ops-mono">{data.fromNumber || "—"}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Task</dt>
                <dd className="ops-mono">{data.taskKey || "—"}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Task status</dt>
                <dd>
                  <StatusBadge
                    status={
                      data.taskStatus === "completed" || data.status === "completed"
                        ? "completed"
                        : (data.taskStatus ?? "pending")
                    }
                    label={
                      data.taskStatus === "completed" || data.status === "completed"
                        ? "Task completed"
                        : data.taskStatus === "incomplete"
                          ? "Task not completed"
                          : "Task pending"
                    }
                  />
                </dd>
              </div>
              <div className="ops-detail-item">
                <dt>Attempts</dt>
                <dd>
                  {data.attemptCount} / {data.maxAttempts}
                </dd>
              </div>
              <div className="ops-detail-item">
                <dt>Created</dt>
                <dd>{formatDateTime(data.createdAt)}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Org</dt>
                <dd className="ops-mono">
                  {data.organizationId ? (
                    <Link to={`/admin-dashboard/organizations/${data.organizationId}`}>
                      {data.organizationId.slice(0, 8)}…
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            {data.errorMessage ? (
              <p style={{ marginTop: "1rem", marginBottom: 0, color: "var(--error-text, #991b1b)" }}>
                {data.errorMessage}
              </p>
            ) : null}
            {data.lastFailureCode ? (
              <p className="ops-muted" style={{ marginBottom: 0 }}>
                Last failure: <span className="ops-mono">{data.lastFailureCode}</span>
              </p>
            ) : null}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Request / context</h2>
            {hasContext && typeof context?.source === "string" ? (
              <span className="ops-faint ops-mono">{context.source}</span>
            ) : null}
          </div>
          <div className="ops-panel-body">
            {!hasContext ? (
              <p className="ops-muted" style={{ margin: 0 }}>
                No request context stored for this call.
              </p>
            ) : (
              <>
                <ContextHighlights context={context!} />
                <pre className="ops-prompt" style={{ marginTop: "0.75rem", maxHeight: 360, overflow: "auto" }}>
                  {JSON.stringify(context, null, 2)}
                </pre>
              </>
            )}
          </div>
        </section>
      </div>

      <div className="ops-two-col">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Transcript</h2>
            <span className="ops-faint">{transcript.length} turns</span>
          </div>
          <div className="ops-panel-body">
            {transcript.length === 0 ? (
              <p className="ops-muted" style={{ margin: 0 }}>
                No transcript yet. It appears after the worker completes the call.
              </p>
            ) : (
              <div className="ops-transcript">
                {transcript.map((row, i) => {
                  const role = (row.role || "").toLowerCase();
                  const isAgent =
                    role.includes("agent") || role.includes("assistant") || role === "ai";
                  return (
                    <div
                      key={row.createdAt?.toString() ?? i}
                      className={`ops-transcript-row${isAgent ? " is-agent" : ""}`}
                    >
                      <span className="ops-transcript-role">{row.role || "unknown"}</span>
                      <p className="ops-transcript-text">{row.content}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Tools used</h2>
            <span className="ops-faint">
              {toolEvents.length} call{toolEvents.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="ops-panel-body">
            {toolEvents.length === 0 ? (
              <p className="ops-muted" style={{ margin: 0 }}>
                {data.status === "completed" ||
                data.status === "incomplete" ||
                data.status === "failed"
                  ? "No tool invocations were recorded for this call."
                  : "No tool invocations yet. Available after the worker completes the call."}
              </p>
            ) : (
              <div className="ops-transcript">
                {toolEvents.map((ev, i) => (
                  <div
                    key={`${ev.toolId}-${ev.at ?? i}`}
                    className={`ops-transcript-row${ev.ok === false ? "" : " is-agent"}`}
                  >
                    <span className="ops-transcript-role">
                      {ev.toolId} · {ev.ok === false ? "fail" : ev.ok === true ? "ok" : "—"}
                      {ev.durationMs != null ? ` · ${ev.durationMs}ms` : ""}
                      {ev.at ? ` · ${formatDateTime(ev.at)}` : ""}
                    </span>
                    <p className="ops-transcript-text" style={{ whiteSpace: "pre-wrap" }}>
                      {ev.summary || ev.error || "—"}
                      {ev.args != null ? (
                        <>
                          {"\n"}
                          <span className="ops-mono" style={{ fontSize: "0.75rem" }}>
                            args: {JSON.stringify(ev.args, null, 2)}
                          </span>
                        </>
                      ) : null}
                      {ev.result != null ? (
                        <>
                          {"\n"}
                          <span className="ops-mono" style={{ fontSize: "0.75rem" }}>
                            result: {JSON.stringify(ev.result, null, 2)}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {data.taskResult ? (
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Task result</h2>
          </div>
          <div className="ops-panel-body">
            <pre className="ops-prompt">{JSON.stringify(data.taskResult, null, 2)}</pre>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ContextHighlights({ context }: { context: Record<string, unknown> }) {
  const chips: { label: string; value: string }[] = [];
  const pick = (key: string, label?: string) => {
    const v = context[key];
    if (v == null || v === "") return;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      chips.push({ label: label ?? key, value: String(v) });
    } else if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      chips.push({ label: label ?? key, value: v.join(", ") });
    }
  };
  pick("source");
  pick("phoneNumber", "phone");
  pick("externalId", "external id");
  pick("firstName", "first name");
  pick("lastName", "last name");
  pick("company");
  pick("email");
  pick("direction");
  if (chips.length === 0) return null;
  return (
    <dl className="ops-detail-grid" style={{ marginBottom: 0 }}>
      {chips.map((c) => (
        <div key={c.label} className="ops-detail-item">
          <dt>{c.label}</dt>
          <dd className="ops-mono" style={{ wordBreak: "break-word" }}>
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

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

function resolveToolEvents(data: CallRecord): ToolEventView[] {
  const fromTop = data.toolEvents;
  if (Array.isArray(fromTop) && fromTop.length > 0) {
    return fromTop
      .map(normalizeToolEvent)
      .filter((x): x is ToolEventView => x != null);
  }
  return extractToolEvents(data.sessionReport);
}

function extractToolEvents(
  sessionReport: Record<string, unknown> | null | undefined,
): ToolEventView[] {
  if (!sessionReport || typeof sessionReport !== "object") return [];
  const raw = sessionReport.toolEvents;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeToolEvent)
    .filter((x): x is ToolEventView => x != null);
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
