import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Field, Input, Select, Textarea } from '@call-agent/ui';
import type { HumanCallMeeting, HumanCallWorkspace, HumanCallWorkspaceActionRequest, UpdateHumanCallWorkspace } from '@call-agent/contracts';
import { executeHumanCallWorkspace, executeUserCrm, getHumanCallWorkspace, getUserCall, resolveHumanCallAction, updateHumanCallWorkspace, UnauthorizedError } from '../../lib/api';
import { useUserAuth } from '../../lib/auth';
import { useUserAsync } from '../hooks/useAsync';
import { HumanCallControls, HUMAN_CALL_PHASES, useHumanCalls } from '../components/HumanCalls';
import { LoadingBlock } from '../components/LoadingBlock';
import { ErrorBlock } from '../components/ErrorBlock';
import { ResourceNotFound } from '../components/ResourceNotFound';
import { PageHeader } from '../components/PageHeader';
import { dateLabel, label, obj, rows, str } from './crm/CrmUi';

export default function HumanCallWorkspacePage() {
  const { id = '' } = useParams();
  // Remount per call so pending requests and drafts can never cross contacts.
  return <Workspace key={id} id={id} />;
}

function Workspace({ id }: { id: string }) {
  const calls = useHumanCalls(), { logout } = useUserAuth();
  const loaded = useUserAsync(() => Promise.all([getUserCall(id), getHumanCallWorkspace(id)]), [id]);
  const [workspace, setWorkspace] = useState<HumanCallWorkspace | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [summaryPreview, setSummaryPreview] = useState(false);
  const uncertainRequest = useRef<HumanCallWorkspaceActionRequest | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { if (loaded.data) setWorkspace(loaded.data[1]); }, [loaded.data]);
  // Refresh after confirmed hang-up; keep in-memory notes drafts intact.
  const activeId = calls.active?.call.id;
  const previousActiveId = useRef(activeId);
  useEffect(() => {
    if (previousActiveId.current === id && activeId !== id) loaded.reload();
    previousActiveId.current = activeId;
  }, [activeId, id, loaded.reload]);
  const failure = (reason: unknown) => {
    if (reason instanceof UnauthorizedError) logout();
    else setError(reason instanceof Error ? reason.message : 'Could not save call results');
  };
  const save = async (update: Omit<UpdateHumanCallWorkspace, 'revision'>) => {
    if (!workspace) return;
    setBusy(true); setError(null);
    try {
      const result = await updateHumanCallWorkspace(id, { revision: workspace.revision, ...update });
      setWorkspace(result);
      if (update.notes !== undefined) calls.setDraft(id, null);
    } catch (reason) { failure(reason); }
    finally { setBusy(false); }
  };
  const execute = async (kind: 'bookMeeting' | 'publishSummary', meeting?: HumanCallMeeting) => {
    if (!workspace) return;
    setBusy(true); setError(null);
    const request = uncertainRequest.current ?? { requestId: crypto.randomUUID(), revision: workspace.revision, kind, ...(meeting ? { meeting } : {}) };
    uncertainRequest.current = request;
    try {
      const result = await executeHumanCallWorkspace(id, request);
      uncertainRequest.current = null; setChecking(false); setWorkspace(result); setSummaryPreview(false);
    } catch (reason) { setChecking(true); failure(reason); }
    finally { setBusy(false); }
  };
  const reconcile = async (requestId: string, resolution: 'found' | 'not_found') => {
    const providerId = resolution === 'found' ? window.prompt('Enter the CRM record ID to verify against this contact:') : undefined;
    if (resolution === 'found' && !providerId) return;
    if (resolution === 'not_found' && !window.confirm('Confirm you inspected this contact’s CRM notes or calendar and no record was created. This permits a new manual attempt.')) return;
    setBusy(true); setError(null);
    try { setWorkspace(await resolveHumanCallAction(id, requestId, { resolution, ...(providerId ? { providerId } : {}) })); }
    catch (reason) { failure(reason); }
    finally { setBusy(false); }
  };
  if (loaded.loading && !workspace) return <LoadingBlock label="Loading call workspace" />;
  if (loaded.notFound) return <ResourceNotFound kind="Call workspace" backTo="/dashboard/crm" backLabel="CRM contacts" />;
  if (!loaded.data || !workspace) return <ErrorBlock message={loaded.error ?? 'Could not load workspace'} onRetry={loaded.reload} />;
  const [savedCall] = loaded.data;
  const isActive = activeId === id;
  const call = isActive ? calls.active!.call : savedCall;
  const session = isActive ? calls.active!.session : savedCall.humanCall!;
  const notes = calls.drafts[id] ?? workspace.notes;
  const dirty = notes !== workspace.notes;
  const disabled = busy || checking;
  const elapsed = call.answeredAt ? Math.max(0, Math.floor(((call.endedAt ? Date.parse(call.endedAt) : calls.now) - Date.parse(call.answeredAt)) / 1000)) : null;
  const hasSummary = workspace.selectedTools.some((tool) => tool === 'interest' || tool === 'notes');
  return <div className="human-workspace">
    <Link to={'/dashboard/crm?tab=contacts' + (session.crmIntegrationId ? '&connection=' + encodeURIComponent(session.crmIntegrationId) : '')}>← CRM contacts</Link>
    <PageHeader eyebrow={isActive ? 'HUMAN CALL' : 'CALL WRAP-UP'} title={session.contactName}
      description={`${call.toNumber ?? ''} · ${HUMAN_CALL_PHASES[session.phase] ?? session.phase}${elapsed === null ? '' : ' · ' + Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0')}`}
    />
    {error && <Alert tone="error">{error}</Alert>}
    {loaded.error && <Alert tone="error">{loaded.error}</Alert>}
    <div className="human-call-actions"><Button size="sm" variant="secondary" disabled={busy} onClick={() => {
      setError(null); void getHumanCallWorkspace(id).then(setWorkspace).catch(failure);
    }}>Refresh saved results</Button>
      {checking && <Button size="sm" disabled={busy} onClick={() => void execute(uncertainRequest.current!.kind)}>Check previous request</Button>}
    </div>
    <div className="human-workspace-grid">
      <aside className="ops-panel"><div className="ops-panel-head"><h2>Call controls</h2></div><div className="ops-panel-body human-controls">
        <dl><dt>Outbound line</dt><dd>{call.fromNumber ?? '—'}</dd><dt>Caller</dt><dd>{session.callerName}</dd></dl>
        {isActive ? <HumanCallControls /> : <p>Call ended. Your selected tools remain available for wrap-up.</p>}
        {session.crmIntegrationId && <Link to={'/dashboard/crm?tab=contacts&connection=' + encodeURIComponent(session.crmIntegrationId) + '&contact=' + encodeURIComponent(session.crmContactId)}>Open CRM contact</Link>}
      </div></aside>
      <main className="human-workspace-tools">
        {!workspace.selectedTools.length && <p>No tools selected for this call.</p>}
        {workspace.selectedTools.includes('interest') && <section className="ops-panel"><div className="ops-panel-head"><h2>Interest</h2></div><div className="ops-panel-body">
          <p role="status">Saved: {workspace.interest === 'interested' ? 'Interested' : workspace.interest === 'not_interested' ? 'Not interested' : 'Unset'}</p>
          <div className="human-call-actions"><Button variant={workspace.interest === 'interested' ? 'primary' : 'secondary'} disabled={disabled} onClick={() => void save({ interest: 'interested' })}>Interested</Button>
            <Button variant={workspace.interest === 'not_interested' ? 'primary' : 'secondary'} disabled={disabled} onClick={() => void save({ interest: 'not_interested' })}>Not interested</Button>
            <Button variant="ghost" disabled={disabled || workspace.interest === null} onClick={() => void save({ interest: null })}>Clear</Button></div>
        </div></section>}
        {workspace.selectedTools.includes('bookMeeting') && (session.crmIntegrationId
          ? <MeetingTool connectionId={session.crmIntegrationId} contactName={session.contactName} disabled={disabled}
            book={(meeting) => execute('bookMeeting', meeting)} />
          : <Alert tone="error">The original CRM connection is unavailable. Meeting booking is disabled.</Alert>)}
      </main>
      <aside className="human-workspace-notes">
        {workspace.selectedTools.includes('notes') && <section className="ops-panel"><div className="ops-panel-head"><h2>Notes</h2></div><div className="ops-panel-body human-controls">
          <Field label="Call notes" htmlFor="human-call-notes"><Textarea id="human-call-notes" rows={10} maxLength={4000} value={notes} disabled={busy}
            onChange={(event) => calls.setDraft(id, event.target.value === workspace.notes ? null : event.target.value)} /></Field>
          <small role="status">{dirty ? 'Unsaved changes' : workspace.updatedAt ? 'Saved · ' + dateLabel(workspace.updatedAt) : 'No notes saved'}</small>
          <div className="human-call-actions"><Button disabled={disabled || !dirty} onClick={() => void save({ notes })}>Save notes</Button>
            <Button variant="ghost" disabled={busy || !dirty} onClick={() => calls.setDraft(id, null)}>Discard draft</Button></div>
        </div></section>}
        {hasSummary && <section className="ops-panel"><div className="ops-panel-head"><h2>CRM summary</h2></div><div className="ops-panel-body human-controls">
          <p>Copy saved interest and notes to the contact’s HighLevel notes.</p>
          <Button variant="secondary" disabled={disabled || dirty || !session.crmIntegrationId || (!workspace.interest && !workspace.notes.trim())} onClick={() => setSummaryPreview(!summaryPreview)}>Preview CRM summary</Button>
          {dirty && <small>Save notes before copying the summary.</small>}
          {summaryPreview && <><pre className="human-summary">{`Speeko call ${id}\nCaller: ${session.callerName}\nCall time: ${call.createdAt}\nInterest: ${workspace.interest === 'interested' ? 'Interested' : workspace.interest === 'not_interested' ? 'Not interested' : 'Unset'}\n\n${workspace.notes}`}</pre>
            <Button disabled={disabled || dirty} onClick={() => void execute('publishSummary')}>Copy summary to CRM</Button></>}
        </div></section>}
      </aside>
    </div>
    {workspace.actions.length > 0 && <section className="ops-panel"><div className="ops-panel-head"><h2>Meeting and CRM activity</h2></div><div className="ops-panel-body human-action-history">
      {[...workspace.actions].reverse().map((action) => <article key={action.requestId}>
        <strong>{action.kind === 'bookMeeting' ? 'Book meeting' : 'Copy summary'} · {action.status}</strong>
        <p>{action.message ?? 'Request started. Refresh to check its result.'}</p>
        {action.meeting && <p>{action.meeting.title} · {dateLabel(action.meeting.startTime)} – {dateLabel(action.meeting.endTime)} · {action.meeting.timezone}</p>}
        <small>{dateLabel(action.createdAt)}{action.providerId ? ' · CRM record ' + action.providerId : ''}</small>
        {action.status === 'uncertain' && <div className="human-call-actions"><Button size="sm" variant="secondary" disabled={disabled} onClick={() => void reconcile(action.requestId, 'found')}>Verify existing CRM record</Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void reconcile(action.requestId, 'not_found')}>I checked CRM: no record</Button></div>}
      </article>)}
    </div></section>}
  </div>;
}

function MeetingTool({ connectionId, contactName, disabled, book }: {
  connectionId: string; contactName: string; disabled: boolean; book: (meeting: HumanCallMeeting) => Promise<void>;
}) {
  const { logout } = useUserAuth();
  const calendars = useUserAsync(() => executeUserCrm(connectionId, { action: 'calendars.list' }), [connectionId]);
  const [calendarId, setCalendarId] = useState(''), [title, setTitle] = useState('Meeting with ' + contactName);
  const [day, setDay] = useState(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); });
  const [start, setStart] = useState(''), [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState<string[] | null>(null), [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null), [review, setReview] = useState<HumanCallMeeting | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const options = rows(calendars.data?.calendars);
  const selected = calendarId || str(options[0]?.id);
  const checkSlots = async () => {
    setReading(true); setError(null); setSlots(null);
    try {
      const result = await executeUserCrm(connectionId, { action: 'slots.list', params: {
        calendarId: selected, startTime: new Date(day + 'T00:00:00').toISOString(), endTime: new Date(day + 'T23:59:59.999').toISOString(), timezone,
      } });
      setSlots(Object.values(result).flatMap((value) => Array.isArray(obj(value).slots) ? (obj(value).slots as unknown[]).map(str) : []));
    } catch (reason) { if (reason instanceof UnauthorizedError) logout(); else setError(reason instanceof Error ? reason.message : 'Could not load availability'); }
    finally { setReading(false); }
  };
  return <section className="ops-panel"><div className="ops-panel-head"><h2>Book meeting</h2></div><div className="ops-panel-body human-controls">
    <p>Attendee: {contactName}. Times shown in {timezone}. Booking can trigger the calendar’s existing notifications.</p>
    {calendars.loading ? <p>Loading calendars…</p> : calendars.error ? <ErrorBlock message={calendars.error} onRetry={calendars.reload} /> : !options.length ? <p>No calendars available on this CRM connection.</p> : <form className="human-controls" onSubmit={(event) => {
      event.preventDefault(); setError(null);
      const instant = new Date(start);
      if (!Number.isFinite(instant.getTime()) || instant.getTime() <= Date.now() || !Number.isInteger(duration) || duration < 5 || duration > 480) { setError('Choose a future start and a duration of 5–480 minutes.'); return; }
      setReview({ calendarId: selected, title: title.trim(), startTime: instant.toISOString(), endTime: new Date(instant.getTime() + duration * 60_000).toISOString(), timezone });
    }}>
      <fieldset className="human-meeting-fields" disabled={disabled || reading || Boolean(review)}>
        <Field label="Calendar" htmlFor="human-calendar"><Select id="human-calendar" value={selected} onChange={(event) => { setCalendarId(event.target.value); setSlots(null); setStart(''); }}>
          {options.map((calendar) => <option key={str(calendar.id)} value={str(calendar.id)}>{label(calendar)}</option>)}
        </Select></Field>
        <Field label="Date for availability" htmlFor="human-meeting-day"><Input id="human-meeting-day" type="date" required value={day} onChange={(event) => { setDay(event.target.value); setSlots(null); }} /></Field>
        <Button type="button" variant="secondary" onClick={() => void checkSlots()}>Check open times</Button>
        {slots && <div className="human-call-actions">{!slots.length ? <p>No open times on this date.</p> : slots.map((slot) => <Button type="button" size="sm" variant="secondary" key={slot} onClick={() => {
          const date = new Date(slot); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); setStart(date.toISOString().slice(0, 16));
        }}>{dateLabel(slot)}</Button>)}</div>}
        <Field label="Meeting title" htmlFor="human-meeting-title"><Input id="human-meeting-title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="Start time" htmlFor="human-meeting-start"><Input id="human-meeting-start" type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <Field label="Duration (minutes)" htmlFor="human-meeting-duration"><Input id="human-meeting-duration" type="number" min={5} max={480} required value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></Field>
        <Button type="submit">Review meeting</Button>
      </fieldset>
      {review && <div className="human-controls" role="status"><strong>Confirm meeting</strong><p>{review.title} · {label(options.find((c) => c.id === review.calendarId) ?? {})}<br />{dateLabel(review.startTime)} – {dateLabel(review.endTime)} · {review.timezone}</p>
        <div className="human-call-actions"><Button type="button" disabled={disabled} onClick={() => void book(review).then(() => setReview(null))}>Confirm booking</Button>
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => setReview(null)}>Edit</Button></div>
      </div>}
    </form>}
    {error && <Alert tone="error">{error}</Alert>}
  </div></section>;
}
