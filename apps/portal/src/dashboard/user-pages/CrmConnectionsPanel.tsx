import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import { CRM_SCOPES } from "@call-agent/contracts";
import {
  createUserOrgIntegration,
  updateUserOrgIntegration,
  deleteUserOrgIntegration,
  testUserOrgIntegration,
  UnauthorizedError,
  type OrganizationIntegration,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";

export default function CrmConnectionsPanel({
  connections,
  onChanged,
}: {
  connections: OrganizationIntegration[];
  onChanged: () => void;
}) {
  const { logout } = useUserAuth();
  const [editing, setEditing] = useState<OrganizationIntegration | null>(null);
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reset = () => {
    setEditing(null);
    setName("");
    setLocationId("");
    setToken("");
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof UnauthorizedError) logout();
      else
        setError(
          e instanceof Error ? e.message : "Could not update CRM connection.",
        );
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const data = {
        name: name.trim(),
        locationId: locationId.trim(),
        apiKey: token.trim() || undefined,
      };
      if (editing) await updateUserOrgIntegration(editing.id, data);
      else
        await createUserOrgIntegration({
          ...data,
          apiKey: token.trim(),
          provider: "ghl_crm",
        });
      reset();
      onChanged();
      setNotice(
        "CRM connection saved. Open CRM to work with live contacts, calendars, and pipelines.",
      );
    });
  };
  const rows = connections.filter((c) => c.provider === "ghl_crm");
  return (
    <div className="crm-connection-grid">
      <section className="ops-panel">
        <div className="ops-panel-head">
          <h2>{editing ? "Edit CRM connection" : "Connect HighLevel CRM"}</h2>
        </div>
        <form className="ops-panel-body ops-form" onSubmit={submit}>
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="info">{notice}</Alert>}
          <p className="ops-desk-note">
            In your HighLevel sub-account, open Settings → Private Integrations,
            create a token with the permissions below, and paste it here with
            that sub-account’s Location ID. Your data appears live in CRM;
            changes save directly to HighLevel.
          </p>
          <Field label="Connection name" htmlFor="crm-name" required>
            <Input
              id="crm-name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="Clinic CRM"
            />
          </Field>
          <Field
            label="Location ID"
            htmlFor="crm-location"
            required
            hint="The sub-account ID in HighLevel’s URL: /location/LOCATION_ID/…"
          >
            <Input
              id="crm-location"
              required
              maxLength={120}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field
            label="Private Integration Token"
            htmlFor="crm-token"
            required={!editing}
            hint={
              editing
                ? "Leave blank to keep the saved token."
                : "Stored on the server. Never returned to the browser."
            }
          >
            <Input
              id="crm-token"
              type="password"
              autoComplete="off"
              required={!editing}
              minLength={8}
              maxLength={500}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={busy}
              placeholder="pit-…"
            />
          </Field>
          <div className="ops-row-actions">
            <Button type="submit" loading={busy}>
              {editing ? "Save changes" : "Connect CRM"}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={reset}
              >
                Cancel
              </Button>
            )}
          </div>
          <details>
            <summary>Permissions for the CRM workspace</summary>
            <p className="ops-desk-note">
              Enable the scopes for the features you plan to use. A missing
              permission only blocks that feature. Calendar edits and workflow
              enrollment can trigger your existing HighLevel automations.
            </p>
            <div className="crm-scopes">
              {CRM_SCOPES.map((scope) => (
                <code key={scope}>{scope}</code>
              ))}
            </div>
            <a
              href="https://marketplace.gohighlevel.com/docs/Authorization/authorization_doc"
              target="_blank"
              rel="noreferrer"
            >
              HighLevel integration documentation ↗
            </a>
          </details>
        </form>
      </section>
      <section className="ops-panel">
        <div className="ops-panel-head">
          <h2>CRM connections</h2>
          <Link to="/dashboard/crm">Open CRM →</Link>
        </div>
        <div className="ops-panel-body">
          {rows.length === 0 && (
            <p className="ops-desk-note">
              Add your CRM connection to bring contacts, appointments, and deals
              into your workspace.
            </p>
          )}
          {rows.map((row) => (
            <article className="crm-connection" key={row.id}>
              <h3>{row.name}</h3>
              <p className="ops-desk-note">
                {row.isActive ? "Active" : "Paused"} · Location {row.locationId}{" "}
                · {row.apiKeyPrefix}
              </p>
              <div className="ops-row-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(row);
                    setName(row.name);
                    setLocationId(row.locationId ?? "");
                    setToken("");
                    setError(null);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await testUserOrgIntegration(row.id);
                      if (!result.ok) throw new Error(result.message);
                      setNotice(
                        `${result.message} Other CRM features require their listed permissions.`,
                      );
                    })
                  }
                >
                  Test contacts access
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await updateUserOrgIntegration(row.id, {
                        isActive: !row.isActive,
                      });
                      onChanged();
                    })
                  }
                >
                  {row.isActive ? "Pause" : "Activate"}
                </Button>
                <Button
                  size="sm"
                  variant="dangerGhost"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Disconnect ${row.name}? Your records remain in HighLevel.`,
                      )
                    )
                      void run(async () => {
                        await deleteUserOrgIntegration(row.id);
                        if (editing?.id === row.id) reset();
                        onChanged();
                      });
                  }}
                >
                  Disconnect
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
