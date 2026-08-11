import { useMemo, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  createUserDispatchRule,
  createUserInboundTrunk,
  deleteUserDispatchRule,
  deleteUserInboundTrunk,
  listUserAgents,
  listUserDispatchRules,
  listUserInboundTrunks,
  publishUserDispatchRule,
  publishUserInbound,
  publishUserInboundTrunk,
  UnauthorizedError,
  type Agent,
  type InboundPublishResult,
  type SipDispatchRule,
  type SipTrunk,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

function formatPublishSummary(result: InboundPublishResult): string {
  const parts: string[] = [];
  const trunkPub = result.trunks.filter((r) => r.outcome === "published").length;
  const trunkSkip = result.trunks.filter((r) => r.outcome === "skipped").length;
  const trunkFail = result.trunks.filter((r) => r.outcome === "failed").length;
  const rulePub = result.dispatchRules.filter((r) => r.outcome === "published").length;
  const ruleSkip = result.dispatchRules.filter((r) => r.outcome === "skipped").length;
  const ruleFail = result.dispatchRules.filter((r) => r.outcome === "failed").length;

  parts.push(
    `Trunks: ${trunkPub} published, ${trunkSkip} skipped, ${trunkFail} failed`,
  );
  parts.push(
    `Rules: ${rulePub} published, ${ruleSkip} skipped, ${ruleFail} failed`,
  );

  const fails = [
    ...result.trunks.filter((r) => r.outcome === "failed"),
    ...result.dispatchRules.filter((r) => r.outcome === "failed"),
  ];
  if (fails.length > 0) {
    parts.push(
      fails
        .map((f) => f.message || `${f.id.slice(0, 8)}… failed`)
        .join("; "),
    );
  }
  return parts.join(". ");
}

export default function InboundTelephonyPanel() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(
    () =>
      Promise.all([
        listUserInboundTrunks(),
        listUserDispatchRules(),
        listUserAgents(),
      ]).then(([trunks, rules, agents]) => ({ trunks, rules, agents })),
    [],
  );

  const [showTrunkForm, setShowTrunkForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);

  // Trunk form
  const [trunkName, setTrunkName] = useState("");
  const [trunkNumbers, setTrunkNumbers] = useState("");
  const [trunkAllowed, setTrunkAllowed] = useState("");
  const [trunkAuthUser, setTrunkAuthUser] = useState("");
  const [trunkAuthPass, setTrunkAuthPass] = useState("");
  const [trunkLivekitId, setTrunkLivekitId] = useState("");
  const [trunkSubmitting, setTrunkSubmitting] = useState(false);
  const [trunkFormError, setTrunkFormError] = useState<string | null>(null);

  // Rule form
  const [ruleName, setRuleName] = useState("");
  const [ruleRoomPrefix, setRuleRoomPrefix] = useState("call-");
  const [ruleTrunkIds, setRuleTrunkIds] = useState<string[]>([]);
  const [ruleAgentId, setRuleAgentId] = useState("");
  const [ruleSubmitting, setRuleSubmitting] = useState(false);
  const [ruleFormError, setRuleFormError] = useState<string | null>(null);

  // Row actions
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publishAllBusy, setPublishAllBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const trunks = data?.trunks ?? [];
  const rules = data?.rules ?? [];
  const agents = data?.agents ?? [];

  const trunkNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trunks) map.set(t.id, t.name);
    return map;
  }, [trunks]);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.id, a.name);
    return map;
  }, [agents]);

  const draftTrunkCount = trunks.filter((t) => t.status === "draft").length;
  const draftRuleCount = rules.filter((r) => r.status === "draft").length;
  const hasDrafts = draftTrunkCount + draftRuleCount > 0;

  const resetTrunkForm = () => {
    setTrunkName("");
    setTrunkNumbers("");
    setTrunkAllowed("");
    setTrunkAuthUser("");
    setTrunkAuthPass("");
    setTrunkLivekitId("");
    setTrunkFormError(null);
  };

  const resetRuleForm = () => {
    setRuleName("");
    setRuleRoomPrefix("call-");
    setRuleTrunkIds([]);
    setRuleAgentId("");
    setRuleFormError(null);
  };

  const handleCreateTrunk = async (e: FormEvent) => {
    e.preventDefault();
    setTrunkFormError(null);
    setActionMsg(null);
    const numbers = parseList(trunkNumbers);
    if (!trunkName.trim() || numbers.length === 0) {
      setTrunkFormError("Name and at least one phone number are required.");
      return;
    }
    setTrunkSubmitting(true);
    try {
      await createUserInboundTrunk({
        name: trunkName.trim(),
        numbers,
        allowedNumbers: parseList(trunkAllowed),
        authUsername: trunkAuthUser.trim() || undefined,
        authPassword: trunkAuthPass || undefined,
        livekitTrunkId: trunkLivekitId.trim() || undefined,
      });
      resetTrunkForm();
      setShowTrunkForm(false);
      setActionMsg({
        tone: "success",
        text: trunkLivekitId.trim()
          ? "Inbound trunk linked and live."
          : "Inbound trunk draft saved. Publish to create it on LiveKit.",
      });
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setTrunkFormError(
        err instanceof ApiError ? err.message : "Could not create inbound trunk.",
      );
    } finally {
      setTrunkSubmitting(false);
    }
  };

  const handleCreateRule = async (e: FormEvent) => {
    e.preventDefault();
    setRuleFormError(null);
    setActionMsg(null);
    if (!ruleName.trim()) {
      setRuleFormError("Name is required.");
      return;
    }
    if (ruleTrunkIds.length === 0) {
      setRuleFormError("Select at least one inbound trunk.");
      return;
    }
    setRuleSubmitting(true);
    try {
      await createUserDispatchRule({
        name: ruleName.trim(),
        ruleType: "individual",
        roomPrefix: ruleRoomPrefix.trim() || "call-",
        sipTrunkIds: ruleTrunkIds,
        organizationAgentId: ruleAgentId || undefined,
      });
      resetRuleForm();
      setShowRuleForm(false);
      setActionMsg({
        tone: "success",
        text: "Dispatch rule draft saved. Publish after inbound trunks are live.",
      });
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setRuleFormError(
        err instanceof ApiError ? err.message : "Could not create dispatch rule.",
      );
    } finally {
      setRuleSubmitting(false);
    }
  };

  const withRowAction = async (
    id: string,
    action: () => Promise<unknown>,
    success: string,
  ) => {
    setBusyId(id);
    setActionMsg(null);
    try {
      await action();
      setActionMsg({ tone: "success", text: success });
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setActionMsg({
        tone: "error",
        text: err instanceof ApiError ? err.message : "Action failed",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handlePublishTrunk = (t: SipTrunk) =>
    withRowAction(
      t.id,
      () => publishUserInboundTrunk(t.id),
      `Trunk “${t.name}” published to LiveKit.`,
    );

  const handleDeleteTrunk = (t: SipTrunk) => {
    const live = Boolean(t.livekitTrunkId?.trim());
    const msg = live
      ? `Delete inbound trunk “${t.name}” from this app and LiveKit Cloud (${t.livekitTrunkId})? This cannot be undone.`
      : `Delete draft inbound trunk “${t.name}”?`;
    if (!window.confirm(msg)) {
      return;
    }
    return withRowAction(
      t.id,
      () => deleteUserInboundTrunk(t.id),
      live ? "Trunk deleted from app and LiveKit." : "Draft trunk deleted.",
    );
  };

  const handlePublishRule = (r: SipDispatchRule) =>
    withRowAction(
      r.id,
      () => publishUserDispatchRule(r.id),
      `Dispatch rule “${r.name}” published to LiveKit.`,
    );

  const handleDeleteRule = (r: SipDispatchRule) => {
    if (
      !window.confirm(
        "Delete this local dispatch rule? LiveKit resource is not deleted.",
      )
    ) {
      return;
    }
    return withRowAction(
      r.id,
      () => deleteUserDispatchRule(r.id),
      "Dispatch rule deleted.",
    );
  };

  const handlePublishAll = async () => {
    setPublishAllBusy(true);
    setActionMsg(null);
    try {
      const result = await publishUserInbound();
      const failed =
        result.trunks.some((r) => r.outcome === "failed") ||
        result.dispatchRules.some((r) => r.outcome === "failed");
      setActionMsg({
        tone: failed ? "error" : "success",
        text: formatPublishSummary(result),
      });
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setActionMsg({
        tone: "error",
        text: err instanceof ApiError ? err.message : "Publish all failed",
      });
    } finally {
      setPublishAllBusy(false);
    }
  };

  const toggleRuleTrunk = (id: string) => {
    setRuleTrunkIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  if (loading) return <LoadingBlock label="Loading inbound telephony" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const inboundAgents = agents.filter(
    (a: Agent) => a.direction === "inbound" || a.isActive,
  );

  return (
    <div className="ops-stack">
      {actionMsg ? <Alert tone={actionMsg.tone}>{actionMsg.text}</Alert> : null}

      <section className="ops-panel">
        <div className="ops-panel-head" style={{ alignItems: "center" }}>
          <div>
            <h2>Publish to LiveKit</h2>
            <p className="ops-faint" style={{ margin: "0.25rem 0 0" }}>
              Draft-first: save trunks and dispatch rules locally, then publish.
              Trunks are published before rules. Point your SIP provider at
              LiveKit for the numbers after trunks go live.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={publishAllBusy}
            disabled={publishAllBusy || !hasDrafts}
            onClick={handlePublishAll}
          >
            Publish all drafts
            {hasDrafts
              ? ` (${draftTrunkCount} trunk${draftTrunkCount === 1 ? "" : "s"}, ${draftRuleCount} rule${draftRuleCount === 1 ? "" : "s"})`
              : ""}
          </Button>
        </div>
      </section>

      {/* ── Inbound trunks ── */}
      <section className="ops-panel">
        <div className="ops-panel-head" style={{ alignItems: "center" }}>
          <h2>Inbound trunks</h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowTrunkForm((v) => !v);
              setTrunkFormError(null);
            }}
          >
            {showTrunkForm ? "Close form" : "Add inbound trunk"}
          </Button>
        </div>

        {showTrunkForm ? (
          <form className="ops-panel-body ops-form" onSubmit={handleCreateTrunk}>
            {trunkFormError ? <Alert tone="error">{trunkFormError}</Alert> : null}
            <Field label="Name" htmlFor="in-trunk-name" required>
              <Input
                id="in-trunk-name"
                value={trunkName}
                onChange={(e) => setTrunkName(e.target.value)}
                disabled={trunkSubmitting}
                placeholder="Main inbound"
              />
            </Field>
            <Field
              label="Numbers"
              htmlFor="in-trunk-nums"
              required
              hint="Comma or newline separated, E.164 preferred"
            >
              <Input
                id="in-trunk-nums"
                value={trunkNumbers}
                onChange={(e) => setTrunkNumbers(e.target.value)}
                disabled={trunkSubmitting}
                placeholder="+15105550100"
              />
            </Field>
            <Field
              label="Allowed caller numbers"
              htmlFor="in-trunk-allowed"
              hint="Optional — only accept calls from these numbers"
            >
              <Input
                id="in-trunk-allowed"
                value={trunkAllowed}
                onChange={(e) => setTrunkAllowed(e.target.value)}
                disabled={trunkSubmitting}
                placeholder="+15551234567"
              />
            </Field>
            <div className="ops-form-grid">
              <Field label="Auth username" htmlFor="in-trunk-user">
                <Input
                  id="in-trunk-user"
                  value={trunkAuthUser}
                  onChange={(e) => setTrunkAuthUser(e.target.value)}
                  disabled={trunkSubmitting}
                  autoComplete="off"
                />
              </Field>
              <Field label="Auth password" htmlFor="in-trunk-pass">
                <Input
                  id="in-trunk-pass"
                  type="password"
                  value={trunkAuthPass}
                  onChange={(e) => setTrunkAuthPass(e.target.value)}
                  disabled={trunkSubmitting}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <Field
              label="Link existing LiveKit trunk (optional)"
              htmlFor="in-trunk-lk"
              hint="If set (ST_…), marks live immediately and skips draft publish"
            >
              <Input
                id="in-trunk-lk"
                value={trunkLivekitId}
                onChange={(e) => setTrunkLivekitId(e.target.value)}
                disabled={trunkSubmitting}
                placeholder="ST_…"
              />
            </Field>
            <div className="ops-form-actions">
              <Button
                type="submit"
                variant="primary"
                loading={trunkSubmitting}
                disabled={trunkSubmitting}
              >
                Save draft
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={trunkSubmitting}
                onClick={() => {
                  resetTrunkForm();
                  setShowTrunkForm(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        <div className="ops-panel-body is-flush">
          {trunks.length === 0 ? (
            <EmptyState
              title="No inbound trunks"
              description="Save a draft with your provider numbers, then publish to LiveKit."
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Numbers</th>
                    <th>LiveKit id</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {trunks.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        {!t.isActive ? (
                          <span className="ops-faint"> · inactive</span>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="ops-mono" style={{ maxWidth: 180 }}>
                        {t.numbers?.join(", ") || "—"}
                      </td>
                      <td className="ops-mono">{t.livekitTrunkId || "—"}</td>
                      <td className="ops-faint">{formatDateTime(t.createdAt)}</td>
                      <td>
                        <div className="ops-row-actions">
                          {t.status === "draft" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              loading={busyId === t.id}
                              disabled={busyId === t.id}
                              onClick={() => handlePublishTrunk(t)}
                            >
                              Publish
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            loading={busyId === t.id}
                            disabled={busyId === t.id}
                            onClick={() => handleDeleteTrunk(t)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Dispatch rules ── */}
      <section className="ops-panel">
        <div className="ops-panel-head" style={{ alignItems: "center" }}>
          <div>
            <h2>Dispatch rules</h2>
            <p className="ops-faint" style={{ margin: "0.25rem 0 0" }}>
              Routes inbound SIP into LiveKit rooms and dispatches your agent.
              Prefer rule type <code>individual</code> with room prefix{" "}
              <code>call-</code>.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={trunks.length === 0}
            onClick={() => {
              setShowRuleForm((v) => !v);
              setRuleFormError(null);
            }}
          >
            {showRuleForm ? "Close form" : "Add dispatch rule"}
          </Button>
        </div>

        {showRuleForm ? (
          <form className="ops-panel-body ops-form" onSubmit={handleCreateRule}>
            {ruleFormError ? <Alert tone="error">{ruleFormError}</Alert> : null}
            <Field label="Name" htmlFor="in-rule-name" required>
              <Input
                id="in-rule-name"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                disabled={ruleSubmitting}
                placeholder="Inbound agent routing"
              />
            </Field>
            <Field
              label="Room prefix"
              htmlFor="in-rule-prefix"
              hint="Default call- for individual rooms"
            >
              <Input
                id="in-rule-prefix"
                value={ruleRoomPrefix}
                onChange={(e) => setRuleRoomPrefix(e.target.value)}
                disabled={ruleSubmitting}
                placeholder="call-"
              />
            </Field>
            <Field label="Inbound trunks" htmlFor="in-rule-trunks" required>
              <div
                id="in-rule-trunks"
                className="ops-check-row"
                role="group"
                aria-label="Inbound trunks"
              >
                {trunks.length === 0 ? (
                  <span className="ops-faint">Add an inbound trunk first.</span>
                ) : (
                  trunks.map((t) => (
                    <label key={t.id} className="ops-check">
                      <input
                        type="checkbox"
                        checked={ruleTrunkIds.includes(t.id)}
                        onChange={() => toggleRuleTrunk(t.id)}
                        disabled={ruleSubmitting}
                      />
                      <span>
                        {t.name}{" "}
                        <span className="ops-faint">
                          ({t.status}
                          {t.numbers?.[0] ? ` · ${t.numbers[0]}` : ""})
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </Field>
            <Field
              label="Organization agent"
              htmlFor="in-rule-agent"
              hint="Persona/tools/task packed into agent job metadata on publish"
            >
              <select
                id="in-rule-agent"
                className="ca-select"
                value={ruleAgentId}
                onChange={(e) => setRuleAgentId(e.target.value)}
                disabled={ruleSubmitting}
                style={{
                  width: "100%",
                  padding: "0.55rem 0.75rem",
                  borderRadius: 8,
                  border: "1px solid var(--ops-line)",
                  background: "#fff",
                  font: "inherit",
                }}
              >
                <option value="">None (default worker agent only)</option>
                {inboundAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.slug ? ` (${a.slug})` : a.key ? ` (${a.key})` : ""}
                    {a.direction ? ` · ${a.direction}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <div className="ops-form-actions">
              <Button
                type="submit"
                variant="primary"
                loading={ruleSubmitting}
                disabled={ruleSubmitting}
              >
                Save draft
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={ruleSubmitting}
                onClick={() => {
                  resetRuleForm();
                  setShowRuleForm(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        <div className="ops-panel-body is-flush">
          {rules.length === 0 ? (
            <EmptyState
              title="No dispatch rules"
              description={
                trunks.length === 0
                  ? "Create an inbound trunk first, then add a routing rule."
                  : "Add a rule to bind trunks to rooms and an org agent, then publish."
              }
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Type / room</th>
                    <th>Trunks</th>
                    <th>Agent</th>
                    <th>LiveKit id</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        {!r.isActive ? (
                          <span className="ops-faint"> · inactive</span>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="ops-mono">
                        {r.ruleType}
                        {r.roomPrefix ? ` · ${r.roomPrefix}` : ""}
                        {r.roomName ? ` · ${r.roomName}` : ""}
                      </td>
                      <td className="ops-faint" style={{ maxWidth: 160 }}>
                        {r.sipTrunkIds?.length
                          ? r.sipTrunkIds
                              .map((id) => trunkNameById.get(id) || id.slice(0, 8))
                              .join(", ")
                          : "—"}
                      </td>
                      <td className="ops-faint">
                        {r.organizationAgentId
                          ? agentNameById.get(r.organizationAgentId) ||
                            r.organizationAgentId.slice(0, 8)
                          : "—"}
                      </td>
                      <td className="ops-mono">
                        {r.livekitDispatchRuleId || "—"}
                      </td>
                      <td>
                        <div className="ops-row-actions">
                          {r.status === "draft" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              loading={busyId === r.id}
                              disabled={busyId === r.id}
                              onClick={() => handlePublishRule(r)}
                            >
                              Publish
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            loading={busyId === r.id}
                            disabled={busyId === r.id}
                            onClick={() => handleDeleteRule(r)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
