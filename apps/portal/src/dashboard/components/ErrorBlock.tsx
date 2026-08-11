import { Alert, Button } from "@call-agent/ui";

type Props = {
  message: string;
  onRetry?: () => void;
};

export function ErrorBlock({ message, onRetry }: Props) {
  return (
    <div className="ops-state" style={{ maxWidth: 480, margin: "0 auto" }}>
      <Alert tone="error">{message}</Alert>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
