import type { ReactNode } from "react";
import { Eyebrow } from "@call-agent/ui";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <header className="ops-page-header">
      <div className="ops-page-header-copy">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ops-page-actions">{actions}</div> : null}
    </header>
  );
}
