import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Alert, Button, Field, Input, Select } from "@call-agent/ui";
import {
  ApiError,
  getOrgQueueSettings,
  getOrgQueueStats,
  pauseOrgQueue,
  resumeOrgQueue,
  UnauthorizedError,
  updateOrgQueueSettings,
} from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { ErrorBlock } from "../components/ErrorBlock";
import { KpiCard } from "../components/KpiCard";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

export default function OrgQueuePage() {
  const { orgId = "" } = useParams();
  const { logout } = useAdminAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const [settings, stats] = await Promise.all([
      getOrgQueueSettings(orgId),
      getOrgQueueStats(orgId),
    ]);
    return { settings, stats };
  }, [orgId]);

  const [maxConcurrent, setMaxConcurrent] = useState(1);
  const [maxDialsPerMinute, setMaxDialsPerMinute] = useState(30);
  const [defaultMaxAttempts, setDefaultMaxAttempts] = useState(3);
  const [backoffStrategy, setBackoffStrategy] = useState<"fixed" | "exponential">("fixed");
  const [backoffBaseSeconds, setBackoffBaseSeconds] = useState(60);
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setMaxConcurrent(s.maxConcurrent);
    setMaxDialsPerMinute(s.maxDialsPerMinute);
    setDefaultMaxAttempts(s.defaultMaxAttempts);
    setBackoffStrategy(s.backoffStrategy);
    setBackoffBaseSeconds(s.backoffBaseSeconds);
    setEnabled(s.enabled);
  }, [data]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await updateOrgQueueSettings(orgId, {
        enabled,
        maxConcurrent,
        maxDialsPerMinute,
        defaultMaxAttempts,
        backoffStrategy,
        backoffBaseSeconds,
      });
      setSaved(true);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not save settings.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePauseResume = async (action: "pause" | "resume") => {
    setActionBusy(true);
    setFormError(null);
    try {
      if (action === "pause") await pauseOrgQueue(orgId);
      else await resumeOrgQueue(orgId);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Queue action failed.");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading queue" />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;

  const { settings, stats } = data;

  return (
    <div className="ops-stack">
      <div className="ops-kpis">
        <KpiCard
          value={stats.counts.pending}
          label="Pending"
          hint={`${stats.counts.pendingReadyNow} ready now`}
        />
        <KpiCard
          value={stats.queue.inProgress}
          label="In flight"
          hint={`${stats.queue.availableSlots} slots free`}
          highlight={stats.queue.inProgress > 0}
        />
        <KpiCard value={stats.counts.completed} label="Completed" />
        <KpiCard value={stats.counts.incomplete ?? 0} label="Incomplete" />
        <KpiCard value={stats.counts.failed} label="Failed" />
      </div>

      <div className="ops-two-col">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Settings</h2>
            <StatusBadge
              status={settings.paused ? "warn" : settings.enabled ? "live" : "inactive"}
              label={settings.paused ? "Paused" : settings.enabled ? "Running" : "Disabled"}
            />
          </div>
          <form className="ops-panel-body ops-form" onSubmit={handleSave}>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {saved ? <Alert tone="success">Settings saved.</Alert> : null}
            <div className="ops-form-grid">
              <Field label="Max concurrent" htmlFor="q-conc">
                <Input
                  id="q-conc"
                  type="number"
                  min={1}
                  max={100}
                  value={String(maxConcurrent)}
                  onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Max dials / minute" htmlFor="q-rate">
                <Input
                  id="q-rate"
                  type="number"
                  min={1}
                  max={600}
                  value={String(maxDialsPerMinute)}
                  onChange={(e) => setMaxDialsPerMinute(Number(e.target.value))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Default max attempts" htmlFor="q-att">
                <Input
                  id="q-att"
                  type="number"
                  min={1}
                  max={20}
                  value={String(defaultMaxAttempts)}
                  onChange={(e) => setDefaultMaxAttempts(Number(e.target.value))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Backoff base (sec)" htmlFor="q-back">
                <Input
                  id="q-back"
                  type="number"
                  min={1}
                  value={String(backoffBaseSeconds)}
                  onChange={(e) => setBackoffBaseSeconds(Number(e.target.value))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Backoff strategy" htmlFor="q-strat">
                <Select
                  id="q-strat"
                  value={backoffStrategy}
                  onChange={(e) =>
                    setBackoffStrategy(e.target.value as "fixed" | "exponential")
                  }
                  disabled={submitting}
                >
                  <option value="fixed">fixed</option>
                  <option value="exponential">exponential</option>
                </Select>
              </Field>
            </div>
            <label className="ops-check">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={submitting}
              />
              Queue enabled
            </label>
            <div className="ops-form-actions">
              <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                Save settings
              </Button>
              {settings.paused ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={actionBusy}
                  disabled={actionBusy}
                  onClick={() => handlePauseResume("resume")}
                >
                  Resume claims
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  loading={actionBusy}
                  disabled={actionBusy}
                  onClick={() => handlePauseResume("pause")}
                >
                  Pause claims
                </Button>
              )}
            </div>
          </form>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Live stats</h2>
            <Button type="button" variant="ghost" size="sm" onClick={reload}>
              Refresh
            </Button>
          </div>
          <div className="ops-panel-body">
            <dl className="ops-detail-grid">
              <div className="ops-detail-item">
                <dt>Dials last minute</dt>
                <dd>{stats.queue.dialsLastMinute}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Creating</dt>
                <dd>{stats.counts.creating}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Dialing</dt>
                <dd>{stats.counts.dialing}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Ready</dt>
                <dd>{stats.counts.ready}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Retries scheduled</dt>
                <dd>{stats.retries.scheduled}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>As of</dt>
                <dd>{formatDateTime(stats.asOf)}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}
