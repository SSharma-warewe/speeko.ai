import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Select } from "@call-agent/ui";
import {
  ApiError,
  createUserOrgIntegration,
  deleteUserOrgIntegration,
  getUserWhatsAppWebhookConfig,
  testUserOrgIntegration,
  UnauthorizedError,
  updateUserOrgIntegration,
  type OrganizationIntegration,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";

export type WaConnKind = "whatsapp" | "ghl_contacts";

const KIND_LABEL: Record<WaConnKind, string> = {
  whatsapp: "Meta WhatsApp Cloud",
  ghl_contacts: "GoHighLevel contacts",
};

export function isWaConnection(
  row: OrganizationIntegration,
): row is OrganizationIntegration & { provider: WaConnKind } {
  return row.provider === "whatsapp" || row.provider === "ghl_contacts";
}

type Props = {
  connections: OrganizationIntegration[];
  onChanged: () => void;
};

export default function WhatsAppConnectionsTab({ connections, onChanged }: Props) {
  const { logout } = useUserAuth();

  const existingKinds = useMemo(
    () => new Set(connections.map((c) => c.provider)),
    [connections],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<WaConnKind>(
    existingKinds.has("whatsapp") && !existingKinds.has("ghl_contacts")
      ? "ghl_contacts"
      : "whatsapp",
  );
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Prefill Meta ids from the inbound webhook setup, when present.
  useEffect(() => {
    let cancelled = false;
    getUserWhatsAppWebhookConfig()
      .then((config) => {
        if (cancelled || !config) return;
        setPhoneNumberId((v) => v || config.phoneNumberId || "");
        setWabaId((v) => v || config.wabaId || "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setToken("");
    setLocationId("");
    setFormError(null);
  };

  const openEdit = (row: OrganizationIntegration & { provider: WaConnKind }) => {
    setEditingId(row.id);
    setKind(row.provider);
    setName(row.name);
    setToken("");
    setPhoneNumberId(row.phoneNumberId ?? "");
    setWabaId(row.wabaId ?? "");
    setLocationId(row.locationId ?? "");
    setFormError(null);
    setActionMsg(null);
  };

  const handleApiError = (err: unknown, fallback: string): string | null => {
    if (err instanceof UnauthorizedError) {
      logout();
      return null;
    }
    return err instanceof ApiError ? err.message : fallback;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setActionMsg(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!editingId && existingKinds.has(kind)) {
      setFormError(
        `A ${KIND_LABEL[kind]} connection already exists. Edit it from the list.`,
      );
      return;
    }
    if (!editingId && token.trim().length < 8) {
      setFormError(
        kind === "whatsapp"
          ? "Paste the Meta access token."
          : "Paste the GoHighLevel Private Integration Token.",
      );
      return;
    }
    if (kind === "whatsapp") {
      if (!/^\d{5,40}$/.test(phoneNumberId.trim())) {
        setFormError("Phone number ID must be numeric.");
        return;
      }
      if (!/^\d{5,40}$/.test(wabaId.trim())) {
        setFormError("WABA ID must be numeric.");
        return;
      }
    } else if (!locationId.trim()) {
      setFormError("Location ID (sub-account) is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await updateUserOrgIntegration(editingId, {
          name: name.trim(),
          ...(token.trim() ? { apiKey: token.trim() } : {}),
          ...(kind === "whatsapp"
            ? { phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim() }
            : { locationId: locationId.trim() }),
        });
        setActionMsg("Connection updated.");
      } else {
        await createUserOrgIntegration({
          name: name.trim(),
          provider: kind,
          apiKey: token.trim(),
          ...(kind === "whatsapp"
            ? { phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim() }
            : { locationId: locationId.trim() }),
        });
        setActionMsg("Connection saved.");
      }
      resetForm();
      onChanged();
    } catch (err) {
      const message = handleApiError(err, "Could not save the connection.");
      if (message) setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (row: OrganizationIntegration) => {
    setBusyId(row.id);
    setActionMsg(null);
    try {
      const result = await testUserOrgIntegration(row.id);
      setActionMsg(
        result.ok
          ? result.message || "Connection OK"
          : result.message || "Connection test failed",
      );
    } catch (err) {
      const message = handleApiError(err, "Could not test the connection.");
      if (message) setActionMsg(message);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = async (row: OrganizationIntegration) => {
    setBusyId(row.id);
    setActionMsg(null);
    try {
      await updateUserOrgIntegration(row.id, { isActive: !row.isActive });
      onChanged();
    } catch (err) {
      const message = handleApiError(err, "Could not update the connection.");
      if (message) setActionMsg(message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: OrganizationIntegration) => {
    if (
      !window.confirm(
        `Delete connection “${row.name}”? You will not be able to send or import contacts until it is re-added.`,
      )
    ) {
      return;
    }
    setBusyId(row.id);
    setActionMsg(null);
    try {
      await deleteUserOrgIntegration(row.id);
      if (editingId === row.id) resetForm();
      setActionMsg("Connection deleted.");
      onChanged();
    } catch (err) {
      const message = handleApiError(err, "Could not delete the connection.");
      if (message) setActionMsg(message);
    } finally {
      setBusyId(null);
    }
  };

  const rows = connections.filter(isWaConnection);

  return (
    <>
      <section className="ops-panel ops-desk-compose">
        <div className="ops-panel-head">
          <span className="ops-desk-kicker">
            {editingId ? "Edit connection" : "New connection"}
          </span>
          <span className="ops-desk-hint">{KIND_LABEL[kind]}</span>
        </div>
        <form
          className="ops-panel-body ops-form ops-desk-form"
          onSubmit={handleSubmit}
        >
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          {actionMsg ? <Alert tone="info">{actionMsg}</Alert> : null}

          <p className="ops-desk-note">
            {kind === "whatsapp" ? (
              <>
                Use a{" "}
                <a
                  href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started"
                  target="_blank"
                  rel="noreferrer"
                >
                  System User access token
                </a>{" "}
                with <span className="ops-mono">whatsapp_business_management</span>{" "}
                (lists templates) and{" "}
                <span className="ops-mono">whatsapp_business_messaging</span>{" "}
                (sends). Messages go out from this phone number, and templates
                come from this WhatsApp Business Account.
              </>
            ) : (
              <>
                GoHighLevel v3 Private Integration Token on the{" "}
                <strong>sub-account</strong> with only{" "}
                <span className="ops-mono">contacts.readonly</span> (View
                Contacts). Contacts are read live and are not copied into
                Speeko.
              </>
            )}
          </p>

          <Field label="Type" htmlFor="wa-conn-kind">
            <Select
              id="wa-conn-kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as WaConnKind);
                setFormError(null);
              }}
              disabled={submitting || Boolean(editingId)}
            >
              <option value="whatsapp">{KIND_LABEL.whatsapp}</option>
              <option value="ghl_contacts">{KIND_LABEL.ghl_contacts}</option>
            </Select>
          </Field>
          <Field label="Name" htmlFor="wa-conn-name" required>
            <Input
              id="wa-conn-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              placeholder={
                kind === "whatsapp" ? "Clinic WhatsApp line" : "Clinic GHL contacts"
              }
            />
          </Field>
          <Field
            label={kind === "whatsapp" ? "Access token" : "Private Integration Token"}
            htmlFor="wa-conn-token"
            required={!editingId}
            hint={
              editingId
                ? "Leave blank to keep the stored token."
                : "Stored server-side and never shown again."
            }
          >
            <Input
              id="wa-conn-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={submitting}
              className="ops-mono"
              placeholder={kind === "whatsapp" ? "EAAG…" : "pit-…"}
            />
          </Field>

          {kind === "whatsapp" ? (
            <>
              <Field
                label="Phone number ID"
                htmlFor="wa-conn-phone"
                required
                hint="Meta: WhatsApp → API Setup → Phone number ID"
              >
                <Input
                  id="wa-conn-phone"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  disabled={submitting}
                  className="ops-mono"
                  placeholder="106540352242922"
                />
              </Field>
              <Field
                label="WABA ID"
                htmlFor="wa-conn-waba"
                required
                hint="WhatsApp Business Account ID. Used to load your templates."
              >
                <Input
                  id="wa-conn-waba"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  disabled={submitting}
                  className="ops-mono"
                  placeholder="102290129340398"
                />
              </Field>
            </>
          ) : (
            <Field
              label="Location ID"
              htmlFor="wa-conn-location"
              required
              hint="GoHighLevel sub-account (location) id"
            >
              <Input
                id="wa-conn-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={submitting}
                className="ops-mono"
                placeholder="ve9EPM428h8vShlRW1KT"
              />
            </Field>
          )}

          <div className="ops-desk-submit">
            <Button type="submit" variant="primary" loading={submitting}>
              {editingId ? "Save changes" : "Save connection"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={resetForm}
              >
                New instead
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="ops-panel ops-desk-list">
        <div className="ops-desk-list-bar">
          <div className="ops-desk-list-bar-main">
            <span className="ops-desk-kicker">Connections</span>
            <span className="ops-desk-hint">{rows.length} total</span>
          </div>
        </div>
        <div className="ops-panel-body is-flush ops-desk-list-body">
          {rows.length === 0 ? (
            <EmptyState
              title="No connections yet"
              description="Add your Meta WhatsApp credentials and a GoHighLevel contacts token on the left."
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table ops-desk-table">
                <thead>
                  <tr>
                    <th>Connection</th>
                    <th>Account</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={editingId === row.id ? "is-live" : undefined}
                    >
                      <td>
                        <div className="ops-desk-entity">
                          <span className="ops-desk-entity-name">{row.name}</span>
                          <span className="ops-desk-entity-meta">
                            <span className="ops-mono">{row.apiKeyPrefix}</span>
                            <span>{KIND_LABEL[row.provider]}</span>
                          </span>
                        </div>
                      </td>
                      <td className="ops-mono">
                        {row.provider === "whatsapp"
                          ? row.phoneNumberId || "—"
                          : row.locationId || "—"}
                      </td>
                      <td>
                        <StatusBadge status={row.isActive ? "active" : "inactive"} />
                      </td>
                      <td>
                        <div className="ops-row-actions">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            loading={busyId === row.id}
                            disabled={busyId === row.id}
                            onClick={() => void handleTest(row)}
                          >
                            Test
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => void handleToggle(row)}
                          >
                            {row.isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => void handleDelete(row)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
