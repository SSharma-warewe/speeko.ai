import { useParams } from "react-router-dom";
import { getCall } from "../../lib/api";
import { CallDetailView } from "../components/CallDetailView";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { ResourceNotFound } from "../components/ResourceNotFound";
import { useAsync } from "../hooks/useAsync";

export default function CallDetailPage() {
  const { id = "" } = useParams();
  const { data, error, notFound, loading, reload } = useAsync(
    () => getCall(id),
    [id],
  );

  if (loading) return <LoadingBlock label="Loading call" />;
  if (notFound || (!data && !error)) {
    return (
      <ResourceNotFound
        kind="Call"
        id={id}
        backTo="/admin-dashboard/calls"
        backLabel="All calls"
      />
    );
  }
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  const orgId = data.organizationId;

  return (
    <CallDetailView
      call={data}
      callsHref="/admin-dashboard/calls"
      orgHref={(id) => `/admin-dashboard/organizations/${id}`}
      agentHref={
        orgId
          ? (agentId) => `/admin-dashboard/organizations/${orgId}/agents/${agentId}`
          : undefined
      }
    />
  );
}
