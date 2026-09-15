import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  generateUserWhatsAppWebhookConfig,
  getUserWhatsAppWebhookConfig,
  UnauthorizedError,
  type WhatsAppWebhookConfig,
  type WhatsAppWebhookConfigSecret,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function WhatsAppWebhookPanel() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(
    getUserWhatsAppWebhookConfig,
    [],
  );

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [secretReveal, setSecretReveal] =
    useState<WhatsAppWebhookConfigSecret | null>(null);
  const [config, setConfig] = useState<WhatsAppWebhookConfig | null>(null);

  useEffect(() => {
    setConfig(data);
    if (data && !secretReveal) {
      setPhoneNumberId(data.phoneNumberId ?? "");
      setWabaId(data.wabaId ?? "");
    }
  }, [data, secretReveal]);

  const submit = async (rotate: boolean) => {
    const phone = phoneNumberId.trim();
    const waba = wabaId.trim();
    if (!phone && !waba) {
      setFormError("Enter a phone number ID and/or WABA ID.");
      return;
    }
    if (rotate) {
      const ok = window.confirm(
        "Rotate the verify token? The current token will stop working in Meta until you paste the new one.",
      );
      if (!ok) return;
    }

    setSubmitting(true);
    setFormError(null);
    setActionMsg(null);
    try {
      const created = await generateUserWhatsAppWebhookConfig({
        ...(phone ? { phoneNumberId: phone } : {}),
        ...(waba ? { wabaId: waba } : {}),
      });
      setSecretReveal(created);
      setConfig(created);
      setPhoneNumberId(created.phoneNumberId ?? "");
      setWabaId(created.wabaId ?? "");
      setActionMsg(
        rotate
          ? "Token rotated. Copy the new verify token now — it will not be shown again."
          : "Webhook created. Copy the URL and verify token now — the token will not be shown again.",
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(
        err instanceof ApiError
          ? err.message
          : rotate
            ? "Could not rotate the WhatsApp webhook token."
            : "Could not generate the WhatsApp webhook.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerate = (e: FormEvent) => {
    e.preventDefault();
    void submit(false);
  };

  if (loading && data === null && !error) {
    return <LoadingBlock label="Loading WhatsApp webhook" />;
  }
  if (error) {
    return <ErrorBlock message={error} onRetry={reload} />;
  }

  const hasConfig = config != null;

  return (
    <section className="ops-panel ops-desk-compose">
      <div className="ops-panel-head">
        <span className="ops-desk-kicker">
          {hasConfig ? "WhatsApp webhook" : "Generate webhook"}
        </span>
        <span className="ops-desk-hint">Meta Cloud API</span>
      </div>
      <form
        className="ops-panel-body ops-form ops-desk-form"
        onSubmit={handleGenerate}
      >
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        {actionMsg ? <Alert tone="info">{actionMsg}</Alert> : null}

        <Alert tone="info">
          Paste the callback URL and verify token into the Meta App Dashboard →
          WhatsApp → Configuration, then subscribe to the <strong>messages</strong>{" "}
          field. Incoming payloads are stored; the agent does not reply yet.
        </Alert>

        {secretReveal ? (
          <div className="ops-desk-secret">
            <Alert tone="warn">
              Copy the verify token now. It will not be shown again.
            </Alert>
            <div className="ops-desk-secret-row">
              <Field label="Callback URL" htmlFor="wa-cb-url">
                <Input
                  id="wa-cb-url"
                  readOnly
                  value={secretReveal.callbackUrl}
                  className="ops-mono"
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const ok = await copyText(secretReveal.callbackUrl);
                  setActionMsg(
                    ok ? "Callback URL copied." : "Could not copy URL.",
                  );
                }}
              >
                Copy
              </Button>
            </div>
            <div className="ops-desk-secret-row">
              <Field label="Verify token" htmlFor="wa-token">
                <Input
                  id="wa-token"
                  readOnly
                  value={secretReveal.verifyToken}
                  className="ops-mono"
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const ok = await copyText(secretReveal.verifyToken);
                  setActionMsg(
                    ok ? "Verify token copied." : "Could not copy token.",
                  );
                }}
              >
                Copy
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSecretReveal(null)}
            >
              Dismiss
            </Button>
          </div>
        ) : null}

        {hasConfig && !secretReveal ? (
          <>
            <div className="ops-desk-secret-row">
              <Field label="Callback URL" htmlFor="wa-url">
                <Input
                  id="wa-url"
                  readOnly
                  value={config.callbackUrl}
                  className="ops-mono"
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const ok = await copyText(config.callbackUrl);
                  setActionMsg(
                    ok ? "Callback URL copied." : "Could not copy URL.",
                  );
                }}
              >
                Copy
              </Button>
            </div>
            <Field label="Verify token prefix" htmlFor="wa-prefix">
              <Input
                id="wa-prefix"
                readOnly
                value={config.verifyTokenPrefix}
                className="ops-mono"
              />
            </Field>
            <StatusBadge
              status={config.isActive ? "active" : "inactive"}
              label={config.isActive ? "Active" : "Off"}
            />
          </>
        ) : null}

        {!hasConfig && !secretReveal ? (
          <EmptyState
            title="No WhatsApp webhook yet"
            description="Add the Meta phone number ID and/or WABA ID, then generate a callback URL and verify token."
          />
        ) : null}

        <Field
          label="Phone number ID"
          htmlFor="wa-phone"
          hint="From Meta: WhatsApp → API Setup → Phone number ID"
        >
          <Input
            id="wa-phone"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            disabled={submitting}
            className="ops-mono"
            placeholder="106540352242922"
          />
        </Field>
        <Field
          label="WABA ID"
          htmlFor="wa-waba"
          hint="WhatsApp Business Account ID (entry.id). At least one ID is required."
        >
          <Input
            id="wa-waba"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            disabled={submitting}
            className="ops-mono"
            placeholder="102290129340398"
          />
        </Field>

        <div className="ops-desk-submit">
          {hasConfig ? (
            <Button
              type="button"
              variant="primary"
              loading={submitting}
              onClick={() => void submit(true)}
            >
              Rotate verify token
            </Button>
          ) : (
            <Button type="submit" variant="primary" loading={submitting}>
              Generate webhook
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
