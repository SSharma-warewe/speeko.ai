import AppointmentWhatsApp from "./AppointmentWhatsApp";
import { useState } from "react";
import { Button, Field, Input, Select } from "@call-agent/ui";
import { useUserAsync } from "../../hooks/useAsync";
import {
  ContactPicker,
  Feedback,
  LoadState,
  Panel,
  RecordForm,
  dateLabel,
  isoDate,
  label,
  localDate,
  obj,
  rows,
  str,
  useCrmApi,
  type Row,
} from "./CrmUi";

function dayInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
export default function CrmCalendar({
  connectionId,
  hasWhatsApp,
}: {
  connectionId: string;
  hasWhatsApp: boolean;
}) {
  const { api, busy, error, notice, mutate, clear } = useCrmApi(connectionId);
  const [calendarId, setCalendarId] = useState("");
  const [start, setStart] = useState(dayInput(new Date()));
  const [end, setEnd] = useState(dayInput(new Date(Date.now() + 7 * 86400000)));
  const [range, setRange] = useState({ start, end });
  const [messageEvent, setMessageEvent] = useState<Row | null>(null);
  const [editor, setEditor] = useState<Row | null>(null);
  const [contactId, setContactId] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const calendars = useUserAsync(() => api("calendars.list"), []);
  const options = rows(calendars.data?.calendars);
  const selected = calendarId || str(options[0]?.id);
  const times = {
    calendarId: selected,
    startTime: new Date(`${range.start}T00:00:00`).toISOString(),
    endTime: new Date(`${range.end}T23:59:59.999`).toISOString(),
  };
  const events = useUserAsync(
    () =>
      selected ? api("events.list", times) : Promise.resolve({ events: [] }),
    [selected, range.start, range.end],
  );
  const records = rows(events.data?.events).sort(
    (a, b) => Date.parse(str(a.startTime)) - Date.parse(str(b.startTime)),
  );
  return (
    <div className="crm-stack">
      <Feedback error={error} notice={notice} />
      <Panel
        title="Calendar"
        actions={
          <Button
            size="sm"
            disabled={busy || !selected}
            onClick={() => {
              setContactId("");
              setEditor({
                calendarId: selected,
                appointmentStatus: "confirmed",
              });
            }}
          >
            Book appointment
          </Button>
        }
      >
        <LoadState state={calendars}>
          <form
            className="crm-calendar-controls"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                end < start ||
                (Date.parse(end) - Date.parse(start)) / 86400000 >= 31
              ) {
                window.alert(
                  "Choose an end date after the start, within 31 days.",
                );
                return;
              }
              setRange({ start, end });
              setSlots(null);
              events.reload();
            }}
          >
            <Field
              label="Calendar"
              htmlFor="crm-calendar"
              className="crm-calendar-select"
            >
              <Select
                id="crm-calendar"
                value={selected}
                onChange={(e) => {
                  setCalendarId(e.target.value);
                  setMessageEvent(null);
                  setEditor(null);
                  setSlots(null);
                }}
              >
                {options.map((c) => (
                  <option key={str(c.id)} value={str(c.id)}>
                    {label(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From" htmlFor="crm-from">
              <Input
                id="crm-from"
                type="date"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Through" htmlFor="crm-through">
              <Input
                id="crm-through"
                type="date"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary">
              Load dates
            </Button>
          </form>
          <p className="ops-desk-note">
            Times shown in {timezone}. Appointments follow your calendar’s
            availability and notification rules.
          </p>
          {!hasWhatsApp && (
            <p id="crm-whatsapp-unavailable" className="ops-desk-note">
              Connect WhatsApp to message appointment contacts.
            </p>
          )}
          {!options.length ? (
            <p>No calendars in this location.</p>
          ) : (
            <>
              <div className="ops-row-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void mutate(async () => {
                      const result = await api("slots.list", {
                        ...times,
                        timezone,
                      });
                      setSlots(
                        Object.values(result).flatMap((value) =>
                          Array.isArray(obj(value).slots)
                            ? (obj(value).slots as unknown[]).map(str)
                            : [],
                        ),
                      );
                    }, "Open times loaded.")
                  }
                >
                  Check open times
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    events.reload();
                    setSlots(null);
                  }}
                >
                  Refresh appointments
                </Button>
              </div>
              {slots && (
                <div className="crm-slots">
                  {!slots.length ? (
                    <p>No open times in this range.</p>
                  ) : (
                    slots.map((time) => (
                      <Button
                        key={time}
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setContactId("");
                          setEditor({
                            calendarId: selected,
                            startTime: localDate(time),
                            endTime: localDate(
                              new Date(
                                Date.parse(time) + 30 * 60000,
                              ).toISOString(),
                            ),
                            appointmentStatus: "confirmed",
                          });
                        }}
                      >
                        {dateLabel(time)}
                      </Button>
                    ))
                  )}
                </div>
              )}
              <LoadState state={events}>
                {!records.length && (
                  <p className="ops-desk-note">
                    No appointments in these dates.
                  </p>
                )}
                <div className="crm-agenda">
                  {records.map((event) => (
                    <article key={str(event.id)} className="crm-event">
                      <div className="crm-event-time">
                        <strong>{dateLabel(event.startTime)}</strong>
                        <small>Until {dateLabel(event.endTime)}</small>
                      </div>
                      <div>
                        <h3>{str(event.title) || "Appointment"}</h3>
                        <p className="ops-desk-note">
                          {str(event.appointmentStatus) || "Scheduled"} ·
                          Contact {str(event.contactId)}
                        </p>
                        <p className="crm-text">{str(event.description)}</p>
                      </div>
                      <div className="ops-row-actions">
                        <span
                          title={
                            !hasWhatsApp
                              ? "Connect WhatsApp to message this contact"
                              : !str(event.contactId)
                                ? "This appointment has no contact"
                                : undefined
                          }
                        >
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-describedby={
                              !hasWhatsApp
                                ? "crm-whatsapp-unavailable"
                                : undefined
                            }
                            disabled={!hasWhatsApp || !str(event.contactId)}
                            onClick={() => setMessageEvent(event)}
                          >
                            WhatsApp message
                          </Button>
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            setEditor({
                              ...event,
                              startTime: localDate(event.startTime),
                              endTime: localDate(event.endTime),
                            })
                          }
                        >
                          Edit / reschedule
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={
                            busy || event.appointmentStatus === "cancelled"
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                `Cancel “${str(event.title) || "this appointment"}” in HighLevel? Calendar automations may run.`,
                              )
                            )
                              void mutate(async () => {
                                await api("events.update", {
                                  id: event.id,
                                  data: { appointmentStatus: "cancelled" },
                                });
                                events.reload();
                              }, "Appointment cancelled.");
                          }}
                        >
                          Cancel booking
                        </Button>
                        <Button
                          size="sm"
                          variant="dangerGhost"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Permanently delete this appointment from HighLevel?",
                              )
                            )
                              void mutate(async () => {
                                await api("events.delete", { id: event.id });
                                events.reload();
                              }, "Appointment deleted.");
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </LoadState>
            </>
          )}
        </LoadState>
      </Panel>
      {messageEvent && (
        <AppointmentWhatsApp
          key={str(messageEvent.id)}
          connectionId={connectionId}
          event={messageEvent}
          hasWhatsApp={hasWhatsApp}
          onClose={() => setMessageEvent(null)}
        />
      )}
      {editor && (
        <RecordForm
          key={str(editor.id) || `new-${str(editor.startTime)}`}
          title={editor.id ? "Edit appointment" : "Book appointment"}
          busy={busy}
          error={error}
          initial={editor}
          onCancel={() => {
            clear();
            setEditor(null);
          }}
          fields={[
            { key: "title", label: "Title", required: true },
            {
              key: "calendarId",
              label: "Calendar",
              required: true,
              options: options.map((c) => ({ id: str(c.id), name: label(c) })),
            },
            {
              key: "startTime",
              label: "Starts",
              type: "datetime-local",
              required: true,
            },
            {
              key: "endTime",
              label: "Ends",
              type: "datetime-local",
              required: true,
            },
            {
              key: "appointmentStatus",
              label: "Status",
              required: true,
              options: [
                "new",
                "confirmed",
                "cancelled",
                "showed",
                "noshow",
                "completed",
              ].map((id) => ({ id, name: id })),
            },
            { key: "description", label: "Description", type: "textarea" },
          ]}
          onSubmit={(values) =>
            void mutate(async () => {
              const data = {
                title: str(values.title),
                calendarId: str(values.calendarId),
                startTime: isoDate(values.startTime),
                endTime: isoDate(values.endTime),
                appointmentStatus: str(values.appointmentStatus),
                description: str(values.description),
                ...(!editor.id ? { contactId } : {}),
              };
              await api(editor.id ? "events.update" : "events.create", {
                ...(editor.id ? { id: editor.id } : {}),
                data,
              });
              setEditor(null);
              setSlots(null);
              events.reload();
            })
          }
        >
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
