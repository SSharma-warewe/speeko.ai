import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field, Textarea } from "@call-agent/ui";
import {
  ApiError,
  getUserWhatsAppAgent,
  UnauthorizedError,
  updateUserWhatsAppAgent,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";

type Props = {
  hasWhatsApp: boolean;
  onGoConnections: () => void;
};

export default function WhatsAppAgentTab({
  hasWhatsApp,
  onGoConnections,
}: Props) {
  const { logout } = useUserAuth();
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () => {
    if (!hasWhatsApp) {
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    getUserWhatsAppAgent()
      .then((config) => {
        setSystemPrompt(config.systemPrompt ?? "");
      })
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) {
          logout();
          return;
        }
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load agent",
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when connection appears
  }, [hasWhatsApp]);

  if (!hasWhatsApp) {
    return (
      <EmptyState
        title="Connect WhatsApp first"
        description="Add a Meta WhatsApp Cloud connection, then set the inbound agent prompt here."
        action={
          <Button type="button" onClick={onGoConnections}>
            Open Connections
          </Button>
        }
      />
    );
  }

  if (loading) return <LoadingBlock label="Loading agent" />;
  if (loadError) {
    return <ErrorBlock message={loadError} onRetry={load} />;
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setSaved(false);
    try {
      const result = await updateUserWhatsAppAgent({ systemPrompt });
      setSystemPrompt(result.systemPrompt ?? "");
      setSaved(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(
        err instanceof ApiError ? err.message : "Failed to save agent",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ops-panel">
      <form className="ops-desk-form" onSubmit={handleSave}>
        <p className="ops-muted">
          This prompt drives auto-replies on your WhatsApp number when someone
          texts in. Leave it empty to disable the agent. Send{" "}
          <code>/new</code> to reset a conversation.
        </p>
        {formError ? <Alert variant="danger">{formError}</Alert> : null}
        {saved && !formError ? (
          <Alert variant="success">Saved.</Alert>
        ) : null}
        <Field
          label="System prompt"
          htmlFor="wa-agent-prompt"
          className="ops-desk-prompt"
        >
          <Textarea
            id="wa-agent-prompt"
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value);
              setSaved(false);
            }}
            rows={14}
            disabled={submitting}
            placeholder="You are a helpful WhatsApp assistant for …"
          />
        </Field>
        <div className="ops-desk-actions">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
