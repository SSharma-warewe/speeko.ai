import { useState } from "react";
import { Button, Field, Input, Select } from "@call-agent/ui";
import { useUserAsync } from "../../hooks/useAsync";
import {
  ContactPicker,
  Feedback,
  LoadState,
  Panel,
  RecordForm,
  label,
  obj,
  rows,
  str,
  useCrmApi,
  type Row,
} from "./CrmUi";

export default function CrmOpportunities({
  connectionId,
}: {
  connectionId: string;
}) {
  const { api, busy, error, notice, mutate, clear } = useCrmApi(connectionId);
  const [pipelineId, setPipelineId] = useState("");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Row | null>(null);
  const [contactId, setContactId] = useState("");
  const [editPipelineId, setEditPipelineId] = useState("");
  const [editStageId, setEditStageId] = useState("");
  const pipelines = useUserAsync(() => api("pipelines.list"), []);
  const options = rows(pipelines.data?.pipelines);
  const selected = pipelineId || str(options[0]?.id);
  const stages = rows(options.find((p) => p.id === selected)?.stages);
  const editStages = rows(options.find((p) => p.id === editPipelineId)?.stages);
  const state = useUserAsync(
    () =>
      selected
        ? api("opportunities.list", {
            pipelineId: selected,
            status,
            query: search,
            page,
            limit: 50,
          })
        : Promise.resolve({ opportunities: [] }),
    [selected, status, search, page],
  );
  const records = rows(state.data?.opportunities);
  const openEditor = (row: Row) => {
    setEditor(row);
    setContactId(str(row.contactId));
    const pipe = str(row.pipelineId) || selected;
    setEditPipelineId(pipe);
    setEditStageId(
      str(row.pipelineStageId) ||
        str(rows(options.find((p) => p.id === pipe)?.stages)[0]?.id),
    );
  };
  const columns = [
    ...stages,
    ...(records.some((r) => !stages.some((s) => s.id === r.pipelineStageId))
      ? [{ id: "", name: "Unassigned" }]
      : []),
  ];
  return (
    <div className="crm-stack">
      <Feedback error={error} notice={notice} />
      <Panel
        title="Opportunities"
        actions={
          <Button
            size="sm"
            disabled={busy || !selected}
            onClick={() => openEditor({ status: "open", monetaryValue: 0 })}
          >
            New opportunity
          </Button>
        }
      >
        <LoadState state={pipelines}>
          <form
            className="crm-search"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query);
              setPage(1);
            }}
          >
            <Select
              aria-label="Pipeline"
              value={selected}
              onChange={(e) => {
                setPipelineId(e.target.value);
                setPage(1);
                setEditor(null);
              }}
            >
              {options.map((p) => (
                <option key={str(p.id)} value={str(p.id)}>
                  {label(p)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Opportunity status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {["all", "open", "won", "lost", "abandoned"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Search opportunities"
              value={query}
              maxLength={75}
              placeholder="Search deals"
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
            <Button type="button" variant="ghost" onClick={state.reload}>
              Refresh
            </Button>
          </form>
          {!options.length ? (
            <p>No pipelines in this location.</p>
          ) : (
            <LoadState state={state}>
              <p className="ops-desk-note">
                {records.length} deals shown on page {page}. Values use your
                HighLevel account currency.
              </p>
              <div className="crm-pipeline-board">
                {columns.map((stage) => {
                  const deals = records.filter((r) =>
                    stage.id
                      ? r.pipelineStageId === stage.id
                      : !stages.some((s) => s.id === r.pipelineStageId),
                  );
                  return (
                    <section className="crm-stage" key={str(stage.id)}>
                      <div className="crm-stage-head">
                        <h3>{label(stage)}</h3>
                        <span>{deals.length}</span>
                      </div>
                      {deals.map((deal) => (
                        <article className="crm-deal" key={str(deal.id)}>
                          <h3>{label(deal)}</h3>
                          <p>
                            {Number(deal.monetaryValue ?? 0).toLocaleString()} ·{" "}
                            {str(deal.status)}
                          </p>
                          <p className="ops-desk-note">
                            {label(obj(deal.contact)) || str(deal.contactId)}
                          </p>
                          <Field
                            label="Move to stage"
                            htmlFor={`crm-stage-${str(deal.id)}`}
                          >
                            <Select
                              id={`crm-stage-${str(deal.id)}`}
                              disabled={busy}
                              value={str(deal.pipelineStageId)}
                              onChange={(e) =>
                                void mutate(async () => {
                                  await api("opportunities.update", {
                                    id: deal.id,
                                    data: {
                                      pipelineId: selected,
                                      pipelineStageId: e.target.value,
                                    },
                                  });
                                  state.reload();
                                }, "Opportunity moved.")
                              }
                            >
                              <option value="" disabled>
                                Unassigned
                              </option>
                              {stages.map((s) => (
                                <option key={str(s.id)} value={str(s.id)}>
                                  {label(s)}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <div className="ops-row-actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => openEditor(deal)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="dangerGhost"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete opportunity “${label(deal)}” from HighLevel?`,
                                  )
                                )
                                  void mutate(async () => {
                                    await api("opportunities.delete", {
                                      id: deal.id,
                                    });
                                    state.reload();
                                  }, "Opportunity deleted.");
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </article>
                      ))}
                      {!deals.length && (
                        <p className="ops-desk-note">No deals on this page.</p>
                      )}
                    </section>
                  );
                })}
              </div>
              <div className="crm-pagination">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span>Page {page}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={records.length < 50}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </LoadState>
          )}
        </LoadState>
      </Panel>
      {editor && (
        <RecordForm
          key={str(editor.id) || "new"}
          title={editor.id ? "Edit opportunity" : "New opportunity"}
          initial={editor}
          busy={busy}
          error={error}
          onCancel={() => {
            clear();
            setEditor(null);
          }}
          fields={[
            { key: "name", label: "Name", required: true },
            {
              key: "monetaryValue",
              label: "Value",
              type: "number",
              required: true,
            },
            {
              key: "status",
              label: "Status",
              required: true,
              options: ["open", "won", "lost", "abandoned"].map((id) => ({
                id,
                name: id,
              })),
            },
          ]}
          onSubmit={(values) =>
            void mutate(async () => {
              const data = {
                name: str(values.name),
                monetaryValue: Number(values.monetaryValue),
                status: str(values.status),
                pipelineId: editPipelineId,
                pipelineStageId: editStageId,
                ...(!editor.id ? { contactId } : {}),
              };
              await api(
                editor.id ? "opportunities.update" : "opportunities.create",
                { ...(editor.id ? { id: editor.id } : {}), data },
              );
              setEditor(null);
              state.reload();
            })
          }
        >
          <div className="crm-form-grid">
            <Field label="Pipeline" required>
              <Select
                required
                disabled={busy}
                value={editPipelineId}
                onChange={(e) => {
                  setEditPipelineId(e.target.value);
                  setEditStageId(
                    str(
                      rows(
                        options.find((p) => p.id === e.target.value)?.stages,
                      )[0]?.id,
                    ),
                  );
                }}
              >
                {options.map((p) => (
                  <option key={str(p.id)} value={str(p.id)}>
                    {label(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Stage" required>
              <Select
                required
                disabled={busy}
                value={editStageId}
                onChange={(e) => setEditStageId(e.target.value)}
              >
                <option value="">Select stage</option>
                {editStages.map((s) => (
                  <option key={str(s.id)} value={str(s.id)}>
                    {label(s)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!editor.id && (
            <Field label="Contact" required>
              <ContactPicker
                api={api}
                value={contactId}
                onChange={setContactId}
                disabled={busy}
              />
            </Field>
          )}
        </RecordForm>
      )}
    </div>
  );
}
