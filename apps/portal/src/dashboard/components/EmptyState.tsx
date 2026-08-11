import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="ops-state">
      <div className="ops-state-title">{title}</div>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
