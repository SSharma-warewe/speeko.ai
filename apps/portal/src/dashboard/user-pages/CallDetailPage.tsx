import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@call-agent/ui";
import {
  ApiError,
  cancelUserCall,
  getUserCall,
  prioritizeUserCall,
  retryUserCall,
  UnauthorizedError,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { CallDetailView } from "../components/CallDetailView";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { ResourceNotFound } from "../components/ResourceNotFound";
import { useUserAsync } from "../hooks/useAsync";

export default function UserCallDetailPage() {
  const { id = "" } = useParams();
  const { logout } = useUserAuth();
  const { data, error, notFound, loading, reload } = useUserAsync(
    () => getUserCall(id),
    [id],
  );
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
  if (notFound || (!data && !error)) {
    return (
      <ResourceNotFound
        kind="Call"
        id={id}
        backTo="/dashboard/calls"
        backLabel="All calls"
      />
    );
  }
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  const pending = data.status === "pending";
  const canRetry = pending || data.status === "failed";

  return (
    <CallDetailView
      call={data}
      callsHref="/dashboard/calls"
      batchHref={(batchId) => `/dashboard/batches/${batchId}`}
      agentHref={(agentId) => `/dashboard/agents/${agentId}`}
      actions={
        pending || canRetry ? (
          <>
            {pending ? (
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
            {canRetry ? (
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
          </>
        ) : null
      }
    />
  );
}
