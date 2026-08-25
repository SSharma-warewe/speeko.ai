import { Link } from "react-router-dom";

type Props = {
  kind: string;
  id?: string;
  backTo: string;
  backLabel: string;
};

export function ResourceNotFound({ kind, id, backTo, backLabel }: Props) {
  const titleKind = kind.toLowerCase();
  return (
    <div className="ops-missing">
      <p className="ops-missing-eyebrow">{kind}</p>
      <h1 className="ops-missing-title">This {titleKind} is not on the tape</h1>
      {id ? (
        <p className="ops-missing-id" title={id}>
          {id}
        </p>
      ) : null}
      <p className="ops-missing-copy">
        It is missing, was removed, or this link is wrong.
      </p>
      <Link to={backTo} className="ops-missing-back">
        ← {backLabel}
      </Link>
    </div>
  );
}
