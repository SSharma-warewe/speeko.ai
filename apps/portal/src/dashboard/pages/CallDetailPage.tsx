import { useParams } from "react-router-dom";
import { getCall } from "../../lib/api";
import { CallDetailView } from "../components/CallDetailView";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { useAsync } from "../hooks/useAsync";

export default function CallDetailPage() {
  const { id = "" } = useParams();
  const { data, error, loading, reload } = useAsync(() => getCall(id), [id]);

  if (loading) return <LoadingBlock label="Loading call" />;
  if (error || !data) return <ErrorBlock message={error ?? "Not found"} onRetry={reload} />;

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
