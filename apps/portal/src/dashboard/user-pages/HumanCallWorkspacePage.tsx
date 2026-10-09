import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Field, Input, Select, Textarea } from '@call-agent/ui';
import type { HumanCallMeeting, HumanCallWorkspace, HumanCallWorkspaceActionRequest, UpdateHumanCallWorkspace } from '@call-agent/contracts';
import { ApiError, executeHumanCallWorkspace, executeUserCrm, getHumanCallWorkspace, getUserCall, resolveHumanCallAction, updateHumanCallWorkspace, UnauthorizedError } from '../../lib/api';
import { useUserAuth } from '../../lib/auth';
import { useUserAsync } from '../hooks/useAsync';
import { HumanCallControls, HUMAN_CALL_PHASES, useHumanCalls } from '../components/HumanCalls';
import { CallIcon } from '../components/HumanCallIcon';
import { LoadingBlock } from '../components/LoadingBlock';
import { ErrorBlock } from '../components/ErrorBlock';
import { ResourceNotFound } from '../components/ResourceNotFound';
import { CrmDrawer, dateLabel, label, localDate, obj, rows, str } from './crm/CrmUi';

export default function HumanCallWorkspacePage() {
  const { id = '' } = useParams();
  return <Workspace key={id} id={id} />;
}

function Workspace({ id }: { id: string }) {
  const calls = useHumanCalls(), { logout } = useUserAuth();
  const loaded = useUserAsync(() => Promise.all([getUserCall(id), getHumanCallWorkspace(id)]), [id]);
  const [workspace, setWorkspace] = useState<HumanCallWorkspace | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [summaryPreview, setSummaryPreview] = useState(false), [sideTab, setSideTab] = useState<'meeting' | 'activity'>('meeting');
  const uncertainRequest = useRef<HumanCallWorkspaceActionRequest | null>(null);
  const [checking, setChecking] = useState(false), [now, setNow] = useState(Date.now());
  const activeId = calls.active?.call.id;
  const previousActiveId = useRef(activeId);
  const savedDraft = useRef<string | undefined>(undefined);
  savedDraft.current = calls.drafts[id];
  useEffect(() => {
    if (loaded.data) setWorkspace((previous) => previous && previous.revision > loaded.data![1].revision ? previous : loaded.data![1]);
  }, [loaded.data]);
  useEffect(() => {
    if (previousActiveId.current === id && activeId !== id) loaded.reload();
    previousActiveId.current = activeId;
  }, [activeId, id, loaded.reload]);
  useEffect(() => {
    if (activeId !== id) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeId, id]);
  const failure = (reason: unknown) => {
    if (reason instanceof UnauthorizedError) logout();
    else setError(reason instanceof Error ? reason.message : 'Could not save call results');
  };
  const save = async (update: Omit<UpdateHumanCallWorkspace, 'revision'>) => {
    if (!workspace || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await updateHumanCallWorkspace(id, { revision: workspace.revision, ...update });
      setWorkspace(result);
      // Typing can continue during a save. Never clear a newer draft.
      if (update.notes !== undefined && savedDraft.current === update.notes) calls.setDraft(id, null);
    } catch (reason) { failure(reason); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true); setError(null);
    try { setWorkspace(await getHumanCallWorkspace(id)); }
    catch (reason) { failure(reason); }
    finally { setBusy(false); }
  };
  const execute = async (kind: 'bookMeeting' | 'publishSummary', meeting?: HumanCallMeeting): Promise<boolean> => {
    if (!workspace || busy) return false;
    setBusy(true); setError(null);
    const request = uncertainRequest.current ?? { requestId: crypto.randomUUID(), revision: workspace.revision, kind, ...(meeting ? { meeting } : {}) };
    uncertainRequest.current = request;
    try {
      const result = await executeHumanCallWorkspace(id, request);
      uncertainRequest.current = null; setChecking(false); setWorkspace(result); setSummaryPreview(false); setSideTab('activity');
      return result.actions.some((action) => action.requestId === request.requestId && action.status === 'succeeded');
    } catch (reason) {
      // Definitive client rejection can be corrected; ambiguous writes keep their exact request ID.
      if (reason instanceof ApiError && reason.status >= 400 && reason.status < 500 && reason.status !== 408) {
        uncertainRequest.current = null; setChecking(false);
      } else setChecking(true);
      failure(reason); return false;
    } finally { setBusy(false); }
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
  const elapsed = call.answeredAt ? Math.max(0, Math.floor(((call.endedAt ? Date.parse(call.endedAt) : now) - Date.parse(call.answeredAt)) / 1000)) : 0;
  const timer = Math.floor(elapsed / 60).toString().padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
  const hasNotes = workspace.selectedTools.includes('notes'), hasInterest = workspace.selectedTools.includes('interest');
  const hasMeeting = workspace.selectedTools.includes('bookMeeting');
  const hasSummary = hasInterest || hasNotes;
  const contactsUrl = '/dashboard/crm?tab=contacts' + (session.crmIntegrationId ? '&connection=' + encodeURIComponent(session.crmIntegrationId) : '');
  const status = HUMAN_CALL_PHASES[session.phase] ?? session.phase;
  return <div className="human-workspace">
    <header className="human-workspace-topbar">
      <div className="human-workspace-brand"><span>speeko<span className="human-brand-dot">.</span></span><i /><span>Call workspace</span></div>
      <div className="human-call-actions"><button className="human-text-button" disabled={busy} onClick={() => void refresh()} aria-label="Refresh saved results"><CallIcon name="refresh" size={15} /><span>Refresh</span></button>
        <Link className="human-back-link" to={contactsUrl} aria-label="← CRM contacts"><CallIcon name="arrowLeft" size={15} />CRM contacts</Link></div>
    </header>
    <header className="human-contact-header">
      <div className="human-contact-avatar">{session.contactName.split(/\s+/).slice(0, 2).map((name) => name[0]).join('')}</div>
      <div className="human-contact-heading"><div className="human-eyebrow">{isActive ? 'OUTBOUND CONVERSATION' : 'CONVERSATION WRAP-UP'}</div><h1>{session.contactName}</h1><span>{call.toNumber ?? '—'}</span></div>
      <div className={'human-session-status' + (session.phase === 'connected' ? ' is-live' : '')}><span className="human-status-dot" /><strong>{status}</strong><span className="human-header-timer">{timer}</span></div>
    </header>
    {(error || calls.error || calls.audioError || loaded.error || checking) && <div className="human-workspace-feedback">
      {(error || calls.error || calls.audioError || loaded.error) && <Alert tone="error">{error || calls.audioError || calls.error || loaded.error}</Alert>}
      {checking && <div className="human-call-actions"><span>The previous request needs checking before another is sent.</span><Button size="sm" disabled={busy} onClick={() => void execute(uncertainRequest.current!.kind)}>Check previous request</Button></div>}
    </div>}
    <div className="human-workspace-grid">
      <aside className="human-call-column">
        <section className="human-call-card" aria-label="Call controls">
          <div className="human-eyebrow"><CallIcon name="phone" size={14} />{isActive ? 'CURRENT CALL' : 'COMPLETED CALL'}</div>
          <div className="human-call-clock">{timer}<span>{call.answeredAt ? 'conversation time' : isActive ? 'ready when you are' : 'no connected audio'}</span></div>
          {isActive ? <HumanCallControls /> : <div className="human-ended-state"><span><CallIcon name="check" size={20} /></span><strong>Call ended</strong><p>Call ended. Your selected tools remain available for wrap-up.</p></div>}
        </section>
        <section className="human-context-card"><h2>Call details</h2><dl><div><dt>Outbound line</dt><dd>{call.fromNumber ?? '—'}</dd></div><div><dt>Caller</dt><dd>{session.callerName}</dd></div></dl>
          {!isActive && <Link className="human-text-button" to={`/dashboard/calls/${id}`}>View saved transcript<CallIcon name="external" size={13} /></Link>}
          {session.crmIntegrationId && <Link className="human-text-button" to={contactsUrl + '&contact=' + encodeURIComponent(session.crmContactId)}>Open CRM contact<CallIcon name="external" size={13} /></Link>}
        </section>
        <p className="human-call-footnote"><CallIcon name="headphones" size={14} />Keep this window open during the call.</p>
      </aside>
      <section className="human-notes-panel">
        <div className="human-panel-heading"><div><CallIcon name="notes" /><h2>{hasNotes ? 'Notes' : 'Conversation'}</h2></div><span className={'human-save-badge' + (dirty ? ' is-draft' : '')} role="status">{busy ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span></div>
        {hasInterest && <section className="human-interest-panel human-interest-inline"><div className="human-panel-heading"><div><CallIcon name="check" /><h2>Interest</h2></div><button className="human-text-button" disabled={disabled || workspace.interest === null} onClick={() => void save({ interest: null })}>Clear</button></div>
          <p>How did the conversation go?</p><div className="human-interest-options"><button className={workspace.interest === 'interested' ? 'is-selected is-positive' : ''} disabled={disabled} aria-pressed={workspace.interest === 'interested'} onClick={() => void save({ interest: 'interested' })}><CallIcon name="check" size={16} />Interested</button>
            <button className={workspace.interest === 'not_interested' ? 'is-selected is-negative' : ''} disabled={disabled} aria-pressed={workspace.interest === 'not_interested'} onClick={() => void save({ interest: 'not_interested' })}><CallIcon name="close" size={16} />Not interested</button></div>
          <small role="status">Saved: {workspace.interest === 'interested' ? 'Interested' : workspace.interest === 'not_interested' ? 'Not interested' : 'Unset'}</small>
        </section>}
        {hasNotes ? <>
          <label className="human-sr-only" htmlFor="human-call-notes">Call notes</label>
          <Textarea className="human-notes-editor" id="human-call-notes" maxLength={4000} value={notes} placeholder="What matters from this conversation?&#10;&#10;Capture their needs, questions, and next steps…"
            onChange={(event) => calls.setDraft(id, event.target.value === workspace.notes ? null : event.target.value)} />
          <div className="human-notes-save"><span>{notes.length.toLocaleString()} / 4,000<span>{dirty ? 'Draft kept while you navigate' : workspace.updatedAt ? 'Saved · ' + dateLabel(workspace.updatedAt) : 'Notes are saved to this call'}</span></span>
            <div className="human-call-actions"><Button size="sm" variant="ghost" disabled={busy || !dirty} onClick={() => calls.setDraft(id, null)}>Discard draft</Button><Button size="sm" disabled={disabled || !dirty} onClick={() => void save({ notes })}><CallIcon name="check" size={15} />Save notes</Button></div></div>
        </> : <div className="human-notes-empty"><CallIcon name="notes" size={32} /><h3>{workspace.selectedTools.length ? 'Stay with the conversation' : 'A focused call'}</h3><p>{workspace.selectedTools.length ? 'Use the selected tools to capture the outcome and plan the next step.' : 'No tools selected for this call.'}</p></div>}
        {hasSummary && <div className="human-summary-bar"><div><CallIcon name="copy" size={16} /><span><strong>Keep CRM in the loop</strong><small>Review saved results before adding a contact note.</small></span></div><Button size="sm" variant="secondary" disabled={disabled || dirty || !session.crmIntegrationId || (!workspace.interest && !workspace.notes.trim())} onClick={() => setSummaryPreview(true)}>Preview CRM summary</Button></div>}
      </section>
      <aside className="human-tools-column">
        <section className="human-tools-panel"><div className="human-tool-tabs" role="tablist" aria-label="Call tools" onKeyDown={(event) => {
          if (!hasMeeting || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'meeting' : event.key === 'End' ? 'activity' : sideTab === 'meeting' ? 'activity' : 'meeting';
          setSideTab(next); document.getElementById('human-' + next + '-tab')?.focus();
        }}>
          {hasMeeting && <button id="human-meeting-tab" role="tab" aria-selected={sideTab === 'meeting'} aria-controls="human-meeting-panel" onClick={() => setSideTab('meeting')}><CallIcon name="calendar" size={16} />Meeting</button>}
          <button id="human-activity-tab" role="tab" aria-selected={!hasMeeting || sideTab === 'activity'} aria-controls="human-activity-panel" onClick={() => setSideTab('activity')}><CallIcon name="activity" size={16} />Activity<span>{workspace.actions.length}</span></button>
        </div>
          {hasMeeting && <div className="human-tool-content" id="human-meeting-panel" role="tabpanel" aria-labelledby="human-meeting-tab" hidden={sideTab !== 'meeting'}>{session.crmIntegrationId
            ? <MeetingTool connectionId={session.crmIntegrationId} contactName={session.contactName} disabled={disabled} book={(meeting) => execute('bookMeeting', meeting)} />
            : <Alert tone="error">The original CRM connection is unavailable. Meeting booking is disabled.</Alert>}</div>}
          <div className="human-tool-content" id="human-activity-panel" role="tabpanel" aria-labelledby="human-activity-tab" hidden={hasMeeting && sideTab !== 'activity'}><div className="human-tool-intro"><h2>Meeting and CRM activity</h2><p>Confirmed results from this conversation.</p></div>
            {!workspace.actions.length ? <div className="human-activity-empty"><CallIcon name="activity" size={28} /><strong>Your next steps will appear here</strong><p>Bookings and summaries are recorded with their CRM result.</p></div> : <div className="human-action-history">{[...workspace.actions].reverse().map((action) => <article key={action.requestId}>
              <span className={'human-action-icon is-' + action.status}><CallIcon name={action.status === 'succeeded' ? 'check' : 'activity'} size={15} /></span><div><strong>{action.kind === 'bookMeeting' ? 'Book meeting' : 'Copy summary'}<span>{action.status}</span></strong>
                <p>{action.message ?? 'Request started. Refresh to check its result.'}</p>{action.meeting && <p>{action.meeting.title}<br />{dateLabel(action.meeting.startTime)} · {action.meeting.timezone}</p>}
                <small>{dateLabel(action.createdAt)}{action.providerId ? ' · CRM record ' + action.providerId : ''}</small>
                {action.status === 'uncertain' && <div className="human-call-actions"><Button size="sm" variant="secondary" disabled={disabled} onClick={() => void reconcile(action.requestId, 'found')}>Verify existing CRM record</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={() => void reconcile(action.requestId, 'not_found')}>I checked CRM: no record</Button></div>}
              </div></article>)}</div>}
          </div>
        </section>
      </aside>
    </div>
    <footer className="human-workspace-footer"><span><span className="human-status-dot" />{isActive ? 'Call workspace active' : 'Ready for wrap-up'}</span><span>{workspace.selectedTools.length} tools selected<span className="human-footer-separator">·</span>Only you can edit this call</span></footer>
    {summaryPreview && <CrmDrawer title="CRM summary" onClose={() => setSummaryPreview(false)} busy={busy}><p>This adds a note to {session.contactName} in HighLevel.</p><pre className="human-summary">{`Speeko call ${id}\nCaller: ${session.callerName}\nCall time: ${call.createdAt}\nInterest: ${workspace.interest === 'interested' ? 'Interested' : workspace.interest === 'not_interested' ? 'Not interested' : 'Unset'}\n\n${workspace.notes}`}</pre>
      <Button disabled={disabled || dirty} onClick={() => void execute('publishSummary')}>Copy summary to CRM</Button></CrmDrawer>}
  </div>;
}

function MeetingTool({ connectionId, contactName, disabled, book }: {
  connectionId: string; contactName: string; disabled: boolean; book: (meeting: HumanCallMeeting) => Promise<boolean>;
}) {
  const { logout } = useUserAuth();
  const calendars = useUserAsync(() => executeUserCrm(connectionId, { action: 'calendars.list' }), [connectionId]);
  const [calendarId, setCalendarId] = useState(''), [title, setTitle] = useState('Meeting with ' + contactName);
  const [day, setDay] = useState(() => localDate(new Date().toISOString()).slice(0, 10));
  const [start, setStart] = useState(''), [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState<string[] | null>(null), [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null), [review, setReview] = useState<HumanCallMeeting | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const options = rows(calendars.data?.calendars);
  const selected = calendarId || str(options[0]?.id);
  const checkSlots = async () => {
    if (!day || !selected) { setError('Choose a calendar and date first.'); return; }
    setReading(true); setError(null); setSlots(null);
    try {
      const result = await executeUserCrm(connectionId, { action: 'slots.list', params: {
        calendarId: selected, startTime: new Date(day + 'T00:00:00').toISOString(), endTime: new Date(day + 'T23:59:59.999').toISOString(), timezone,
      } });
      setSlots(Object.values(result).flatMap((value) => Array.isArray(obj(value).slots) ? (obj(value).slots as unknown[]).map(str).filter((slot) => Number.isFinite(Date.parse(slot))) : []));
    } catch (reason) { if (reason instanceof UnauthorizedError) logout(); else setError(reason instanceof Error ? reason.message : 'Could not load availability'); }
    finally { setReading(false); }
  };
  return <div className="human-meeting-tool"><div className="human-tool-intro"><h2>Book meeting</h2><p>Turn a good conversation into a next step.</p></div>
    {calendars.loading ? <p>Loading calendars…</p> : calendars.error ? <ErrorBlock message={calendars.error} onRetry={calendars.reload} /> : !options.length ? <p>No calendars available on this CRM connection.</p> : <form className="human-meeting-form" onSubmit={(event) => {
      event.preventDefault(); setError(null);
      const instant = new Date(start);
      if (!Number.isFinite(instant.getTime()) || instant.getTime() <= Date.now() || !Number.isInteger(duration) || duration < 5 || duration > 480 || !title.trim()) { setError('Choose a title, future start, and duration of 5–480 minutes.'); return; }
      setReview({ calendarId: selected, title: title.trim(), startTime: instant.toISOString(), endTime: new Date(instant.getTime() + duration * 60_000).toISOString(), timezone });
    }}>
      <fieldset className="human-meeting-fields" disabled={disabled || reading || Boolean(review)} hidden={Boolean(review)}>
        <Field label="Calendar" htmlFor="human-calendar"><Select id="human-calendar" value={selected} onChange={(event) => { setCalendarId(event.target.value); setSlots(null); setStart(''); }}>
          {options.map((calendar) => <option key={str(calendar.id)} value={str(calendar.id)}>{label(calendar)}</option>)}
        </Select></Field>
        <div className="human-availability-row"><Field label="Date for availability" htmlFor="human-meeting-day"><Input id="human-meeting-day" type="date" required value={day} onChange={(event) => { setDay(event.target.value); setSlots(null); }} /></Field><Button type="button" size="sm" variant="secondary" loading={reading} onClick={() => void checkSlots()}>Check open times</Button></div>
        {slots && <div className="human-slot-options human-call-actions">{!slots.length ? <p>No open times on this date.</p> : slots.map((slot) => <Button type="button" size="sm" variant={localDate(slot) === start ? 'primary' : 'secondary'} key={slot} onClick={() => setStart(localDate(slot))}>{new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Button>)}</div>}
        <Field label="Meeting title" htmlFor="human-meeting-title"><Input id="human-meeting-title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="Start time" htmlFor="human-meeting-start"><Input id="human-meeting-start" type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <div className="human-meeting-duration"><Field label="Duration (minutes)" htmlFor="human-meeting-duration"><Input id="human-meeting-duration" type="number" min={5} max={480} required value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></Field><span>Times in<br /><strong>{timezone}</strong></span></div>
        <Button type="submit"><CallIcon name="calendar" size={16} />Review meeting</Button>
      </fieldset>
      {review && <div className="human-meeting-review" role="status"><span className="human-review-icon"><CallIcon name="calendar" size={24} /></span><h3>Confirm meeting</h3><strong>{review.title}</strong><p>{label(options.find((c) => c.id === review.calendarId) ?? {})}<br />{dateLabel(review.startTime)}<br />{duration} minutes · {review.timezone}</p>
        <small>Attendee: {contactName}. Booking can trigger the calendar’s existing notifications.</small>
        <Button type="button" disabled={disabled} onClick={() => void book(review).then((succeeded) => { if (succeeded) { setReview(null); setStart(''); } })}>Confirm booking</Button><Button type="button" variant="ghost" disabled={disabled} onClick={() => setReview(null)}>Edit</Button>
      </div>}
    </form>}
    {error && <Alert tone="error">{error}</Alert>}
  </div>;
}
