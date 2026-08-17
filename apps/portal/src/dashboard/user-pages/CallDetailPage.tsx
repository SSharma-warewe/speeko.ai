import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@call-agent/ui";
import {
  ApiError,
  cancelUserCall,
  getUserCall,
  prioritizeUserCall,
  retryUserCall,
  UnauthorizedError,
  type CallRecord,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

export default function UserCallDetailPage() {
  const { id = "" } = useParams();
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(() => getUserCall(id), [id]);
  const [busy, setBusy] = useState(false);

  const runAction = async (action: "cancel" | "retry" | "prioritize") => {
    setBusy(true);
    try {
      if (action === "cancel") await cancelUserCall(id);
      else if (action === "retry") await retryUserCall(id);
      else await prioritizeUserCall(id);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      window.alert(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

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
        <Link to="/dashboard/calls" className="ops-muted">
          ← All calls
        </Link>
      </p>

      <PageHeader
        eyebrow={data.medium.toUpperCase()}
        title="Call detail"
        description={data.roomName ? `Room ${data.roomName}` : "Room not created yet"}
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <StatusBadge status={data.status} />
            {data.status === "pending" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => runAction("cancel")}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => runAction("prioritize")}
                >
                  Prioritize
                </Button>
              </>
            ) : null}
            {data.status === "pending" || data.status === "failed" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => runAction("retry")}
              >
                Retry now
              </Button>
            ) : null}
          </div>
        }
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
                <dt>Priority</dt>
                <dd>{data.priority ?? 0}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Created</dt>
                <dd>{formatDateTime(data.createdAt)}</dd>
              </div>
              {data.batchId ? (
                <div className="ops-detail-item">
                  <dt>Batch</dt>
                  <dd>
                    <Link to={`/dashboard/batches/${data.batchId}`} className="ops-mono">
                      {data.batchId.slice(0, 8)}…
                    </Link>
                  </dd>
                </div>
              ) : null}
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
                <pre
                  className="ops-mono"
                  style={{
                    margin: "0.75rem 0 0",
                    padding: "0.75rem",
                    borderRadius: 8,
                    border: "1px solid var(--ops-line)",
                    background: "#fafafa",
                    fontSize: "0.75rem",
                    overflow: "auto",
                    maxHeight: 360,
                  }}
                >
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
                No transcript yet.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.75rem" }}>
                {transcript.map((line, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "0.65rem 0.75rem",
                      borderRadius: 8,
                      border: "1px solid var(--ops-line)",
                      background: line.role === "assistant" ? "#faf8f4" : "#fff",
                    }}
                  >
                    <div className="ops-mono" style={{ fontSize: "0.7rem", marginBottom: 4 }}>
                      {line.role}
                    </div>
                    <div style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{line.content}</div>
                  </li>
                ))}
              </ul>
            )}
            {data.taskResult ? (
              <div style={{ marginTop: "1.25rem" }}>
                <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>Task result</h3>
                <pre
                  className="ops-mono"
                  style={{
                    margin: 0,
                    padding: "0.75rem",
                    borderRadius: 8,
                    border: "1px solid var(--ops-line)",
                    background: "#fafafa",
                    fontSize: "0.75rem",
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(data.taskResult, null, 2)}
                </pre>
              </div>
            ) : null}
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
                  : "No tool invocations yet. They appear after the worker completes the call."}
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.65rem" }}>
                {toolEvents.map((ev, i) => (
                  <ToolEventCard key={`${ev.toolId}-${ev.at ?? i}`} ev={ev} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
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
    <dl
      className="ops-detail-grid"
      style={{ marginBottom: 0 }}
    >
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

function ToolEventCard({ ev }: { ev: ToolEventView }) {
  return (
    <li
      style={{
        padding: "0.65rem 0.75rem",
        borderRadius: 8,
        border: "1px solid var(--ops-line)",
        background: ev.ok === false ? "#fef2f2" : "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem 1rem",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <span className="ops-mono" style={{ fontWeight: 600 }}>
          {ev.toolId}
        </span>
        <span className="ops-mono" style={{ fontSize: "0.75rem" }}>
          {ev.ok === false ? "fail" : ev.ok === true ? "ok" : "—"}
          {ev.durationMs != null ? ` · ${ev.durationMs}ms` : ""}
          {ev.error ? ` · ${ev.error}` : ""}
        </span>
        {ev.at ? (
          <span className="ops-muted" style={{ fontSize: "0.75rem", marginLeft: "auto" }}>
            {formatDateTime(ev.at)}
          </span>
        ) : null}
      </div>
      {ev.summary ? (
        <div style={{ fontSize: "0.85rem", marginBottom: ev.args != null || ev.result != null ? 6 : 0 }}>
          {ev.summary}
        </div>
      ) : null}
      {ev.args != null ? (
        <JsonBlock label="args" value={ev.args} />
      ) : null}
      {ev.result != null ? (
        <JsonBlock label="result" value={ev.result} />
      ) : null}
    </li>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div className="ops-muted" style={{ fontSize: "0.7rem", marginBottom: 2 }}>
        {label}
      </div>
      <pre
        className="ops-mono"
        style={{
          margin: 0,
          padding: "0.5rem",
          borderRadius: 6,
          background: "#fafafa",
          fontSize: "0.7rem",
          overflow: "auto",
          maxHeight: 200,
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

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
