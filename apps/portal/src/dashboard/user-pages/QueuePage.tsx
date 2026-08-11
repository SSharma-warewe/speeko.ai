import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Select } from "@call-agent/ui";
import {
  ApiError,
  getUserQueueSettings,
  getUserQueueStats,
  pauseUserQueue,
  resumeUserQueue,
  UnauthorizedError,
  updateUserQueueSettings,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { ErrorBlock } from "../components/ErrorBlock";
import { KpiCard } from "../components/KpiCard";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

export default function UserQueuePage() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(async () => {
    const [settings, stats] = await Promise.all([
      getUserQueueSettings(),
      getUserQueueStats(),
    ]);
    return { settings, stats };
  }, []);

  const [maxConcurrent, setMaxConcurrent] = useState(1);
  const [maxDialsPerMinute, setMaxDialsPerMinute] = useState(30);
  const [defaultMaxAttempts, setDefaultMaxAttempts] = useState(3);
  const [backoffStrategy, setBackoffStrategy] = useState<"fixed" | "exponential">("fixed");
  const [backoffBaseSeconds, setBackoffBaseSeconds] = useState(60);
  const [backoffMaxSeconds, setBackoffMaxSeconds] = useState(3600);
  const [enabled, setEnabled] = useState(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("21:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
  const [quietHoursTimezone, setQuietHoursTimezone] = useState("Asia/Kolkata");
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
    setBackoffMaxSeconds(s.backoffMaxSeconds);
    setEnabled(s.enabled);
    setQuietHoursEnabled(s.quietHoursEnabled);
    setQuietHoursStart(s.quietHoursStart || "21:00");
    setQuietHoursEnd(s.quietHoursEnd || "08:00");
    setQuietHoursTimezone(s.quietHoursTimezone || "Asia/Kolkata");
  }, [data]);

  useEffect(() => {
    const id = window.setInterval(() => reload(), 8000);
    return () => window.clearInterval(id);
  }, [reload]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await updateUserQueueSettings({
        enabled,
        maxConcurrent,
        maxDialsPerMinute,
        defaultMaxAttempts,
        backoffStrategy,
        backoffBaseSeconds,
        backoffMaxSeconds,
        quietHoursEnabled,
        quietHoursStart: quietHoursEnabled ? quietHoursStart : null,
        quietHoursEnd: quietHoursEnabled ? quietHoursEnd : null,
        quietHoursTimezone,
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
      if (action === "pause") await pauseUserQueue();
      else await resumeUserQueue();
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

  if (loading && !data) return <LoadingBlock label="Loading queue" />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;

  const { settings, stats } = data;

  return (
    <div>
      <PageHeader
        eyebrow="Configure"
        title="Outbound queue"
        description="Concurrency, dial rate, retries, quiet hours, and live claim stats for your org dialer."
      />

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
              <Field label="Max concurrent" htmlFor="uq-conc">
                <Input
                  id="uq-conc"
                  type="number"
                  min={1}
                  max={100}
                  value={String(maxConcurrent)}
                  onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Max dials / minute" htmlFor="uq-rate">
                <Input
                  id="uq-rate"
                  type="number"
                  min={1}
                  max={600}
                  value={String(maxDialsPerMinute)}
                  onChange={(e) => setMaxDialsPerMinute(Number(e.target.value))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Default max attempts" htmlFor="uq-att">
                <Input
                  id="uq-att"
                  type="number"
                  min={1}
                  max={20}
                  value={String(defaultMaxAttempts)}
                  onChange={(e) => setDefaultMaxAttempts(Number(e.target.value))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Backoff base (sec)" htmlFor="uq-back">
                <Input
                  id="uq-back"
                  type="number"
                  min={1}
                  value={String(backoffBaseSeconds)}
                  onChange={(e) => setBackoffBaseSeconds(Number(e.target.value))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Backoff max (sec)" htmlFor="uq-backmax">
                <Input
                  id="uq-backmax"
                  type="number"
                  min={1}
                  value={String(backoffMaxSeconds)}
                  onChange={(e) => setBackoffMaxSeconds(Number(e.target.value))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Backoff strategy" htmlFor="uq-strat">
                <Select
                  id="uq-strat"
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
            <label className="ops-check">
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                disabled={submitting}
              />
              Quiet hours
            </label>
            {quietHoursEnabled ? (
              <div className="ops-form-grid">
                <Field label="Start (HH:mm)" htmlFor="uq-qh-s">
                  <Input
                    id="uq-qh-s"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    disabled={submitting}
                    placeholder="21:00"
                  />
                </Field>
                <Field label="End (HH:mm)" htmlFor="uq-qh-e">
                  <Input
                    id="uq-qh-e"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    disabled={submitting}
                    placeholder="08:00"
                  />
                </Field>
                <Field label="Timezone" htmlFor="uq-qh-tz">
                  <Input
                    id="uq-qh-tz"
                    value={quietHoursTimezone}
                    onChange={(e) => setQuietHoursTimezone(e.target.value)}
                    disabled={submitting}
                    placeholder="Asia/Kolkata"
                  />
                </Field>
              </div>
            ) : null}
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
            {settings.retryOn?.length ? (
              <p className="ops-muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
                Retry on:{" "}
                <span className="ops-mono">{settings.retryOn.join(", ")}</span>
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
