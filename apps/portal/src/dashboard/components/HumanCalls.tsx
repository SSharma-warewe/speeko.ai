import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LiveKitRoom, RoomAudioRenderer, StartAudio, useConnectionState, useLocalParticipant, useMediaDeviceSelect } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { Alert, Button, Field, Select } from '@call-agent/ui';
import { HUMAN_CALL_TOOL_IDS, type CreateHumanCallRequest, type HumanCallResponse, type HumanCallToolId, type SipTrunk } from '@call-agent/contracts';
import { createHumanCall, endHumanCall, getActiveHumanCall, getUserCall, joinHumanCall, listUserOutboundTrunks, UnauthorizedError } from '../../lib/api';
import { useUserAuth } from '../../lib/auth';
import { CrmDrawer } from '../user-pages/crm/CrmUi';
import './HumanCalls.css';

export const HUMAN_TOOL_LABELS: Record<HumanCallToolId, string> = {
  interest: 'Interested / Not interested', bookMeeting: 'Book meeting', notes: 'Notes',
};
export const HUMAN_CALL_PHASES: Record<string, string> = {
  preparing: 'Preparing call', waiting_for_user: 'Enable your microphone to dial',
  dialing: 'Dialing contact', connected: 'Connected', reconnecting: 'Reconnecting · 15-second grace',
  ending: 'Ending call', ended: 'Call ended',
};
const REASONS: Record<string, string> = {
  admission_denied: 'Calling was blocked by organization capacity, pause, or allowed hours.',
  contact_or_trunk_invalid: 'The contact or phone line changed or is unavailable.',
  validation_unavailable: 'Could not revalidate the contact or phone line.',
  no_answer: 'The contact did not answer.', busy: 'The contact’s line was busy.',
  join_timeout: 'The microphone join deadline expired.', browser_disconnected: 'Call ended after the browser disconnected.',
  caller_inactive: 'The caller account is no longer active.', preparation_failed: 'Could not prepare the call.',
  room_missing: 'The call room became unavailable.',
};
type CallsState = {
  enabled: boolean; active: HumanCallResponse | null; error: string | null; busy: boolean;
  audioCallId: string | null; now: number;
  start: (request: CreateHumanCallRequest) => Promise<HumanCallResponse>;
  join: () => Promise<void>; end: () => Promise<void>;
  drafts: Record<string, string>; setDraft: (id: string, text: string | null) => void;
};
const Context = createContext<CallsState | null>(null);
export function useHumanCalls() {
  const context = useContext(Context);
  if (!context) throw new Error('HumanCallsProvider is required');
  return context;
}

export function HumanCallsProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useUserAuth();
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState<HumanCallResponse | null>(null);
  const activeRef = useRef<HumanCallResponse | null>(null);
  const mutationVersion = useRef(0), mutationsPending = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const onAudioError = useCallback(() => setAudioError('Could not connect call audio. Check microphone permissions and reconnect.'), []);
  const onMediaFailure = useCallback(() => setAudioError('Microphone unavailable. Check browser permissions or select another device.'), []);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<(NonNullable<HumanCallResponse['connection']> & { callId: string }) | null>(null);
  const releaseAudio = useRef<(() => void) | null>(null);
  const [lastCall, setLastCall] = useState<{ id: string; message: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const setDraft = useCallback((id: string, text: string | null) => setDrafts((previous) => {
    const next = { ...previous }; if (text === null) delete next[id]; else next[id] = text; return next;
  }), []);
  useEffect(() => {
    if (!Object.keys(drafts).length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafts]);
  useEffect(() => () => { releaseAudio.current?.(); }, []);
  const accept = useCallback((response: HumanCallResponse | null) => {
    if (activeRef.current?.call.id !== response?.call.id || response?.session.phase === 'ended') {
      setConnection(null); releaseAudio.current?.(); releaseAudio.current = null;
    }
    activeRef.current = response; setActive(response);
  }, []);
  useEffect(() => {
    let disposed = false, running = false;
    const refresh = async () => {
      if (document.hidden || running || !user || mutationsPending.current) return;
      running = true;
      const version = mutationVersion.current;
      try {
        const result = await getActiveHumanCall();
        if (disposed || version !== mutationVersion.current) return;
        const previous = activeRef.current;
        if (previous && !result.active) {
          const call = await getUserCall(previous.call.id);
          if (disposed || version !== mutationVersion.current) return;
          setLastCall({ id: call.id, message: REASONS[call.humanCall?.endReason ?? ''] ?? 'Call ended. Finish your wrap-up.' });
        }
        setEnabled(result.enabled); accept(result.active); setError(null);
      } catch (failure) {
        if (!disposed && version === mutationVersion.current) {
          if (failure instanceof UnauthorizedError) logout();
          else setError(failure instanceof Error ? failure.message : 'Could not check call status');
        }
      } finally { running = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { setNow(Date.now()); void refresh(); }, 2000);
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh);
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [user?.id, logout, accept]);

  const attachAudio = async (result: HumanCallResponse) => {
    if (!result.connection) return;
    if (releaseAudio.current) { setConnection({ ...result.connection, callId: result.call.id }); return; }
    if (!navigator.locks) throw new Error('This browser cannot safely own call audio. Use a current browser with Web Locks support.');
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request('speeko-human-audio-' + user!.id, { ifAvailable: true }, async (lock) => {
        if (!lock) { reject(new Error('Call audio is already open in another tab. Return to that tab.')); return; }
        await new Promise<void>((release) => {
          releaseAudio.current = release;
          setConnection({ ...result.connection!, callId: result.call.id }); resolve();
        });
      }).catch(reject);
    });
  };
  const start = async (request: CreateHumanCallRequest) => {
    mutationVersion.current++; mutationsPending.current++;
    try {
      const result = await createHumanCall(request);
      accept(result); setLastCall(null); setError(null); setAudioError(null);
      try { await attachAudio(result); } catch (failure) { setAudioError(failure instanceof Error ? failure.message : 'Could not connect audio'); }
      return result;
    } finally { mutationsPending.current--; mutationVersion.current++; }
  };
  const join = async () => {
    if (!activeRef.current) return;
    setBusy(true); setAudioError(null);
    try { await attachAudio(await joinHumanCall(activeRef.current.call.id)); }
    catch (failure) { setAudioError(failure instanceof Error ? failure.message : 'Could not connect audio'); }
    finally { setBusy(false); }
  };
  const end = async () => {
    if (!activeRef.current) return;
    mutationVersion.current++; mutationsPending.current++; setBusy(true); setError(null);
    try { accept(await endHumanCall(activeRef.current.call.id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not request hang-up'); }
    finally { mutationsPending.current--; mutationVersion.current++; setBusy(false); }
  };
  return (
    <LiveKitRoom className="human-room" serverUrl={connection?.serverUrl} token={connection?.participantToken}
      connect={Boolean(connection)} audio={true} video={false}
      onError={onAudioError} onMediaDeviceFailure={onMediaFailure}>
      <Context.Provider value={{ enabled, active, error, busy, audioCallId: connection?.callId ?? null, now, start, join, end, drafts, setDraft }}>
        {active && <section className="human-call-strip" aria-label="Active human call">
          <div><strong>Human call · {active.session.contactName}</strong><span>{active.call.toNumber} · {HUMAN_CALL_PHASES[active.session.phase]}</span></div>
          <div className="human-call-actions"><Link to={'/dashboard/crm/call/' + active.call.id}>Open workspace</Link><HumanCallControls compact /></div>
        </section>}
        {!active && lastCall && <div className="human-call-strip" role="status"><span>{lastCall.message}</span>
          <Link to={'/dashboard/crm/call/' + lastCall.id}>Finish wrap-up</Link>
          <Button size="sm" variant="ghost" onClick={() => setLastCall(null)}>Dismiss</Button></div>}
        {error && <Alert tone="error">{error}</Alert>}
        {audioError && <Alert tone="error">{audioError}</Alert>}
        <RoomAudioRenderer /><StartAudio label="Enable call sound" />
        {children}
      </Context.Provider>
    </LiveKitRoom>
  );
}

function AudioDevice({ kind, label }: { kind: 'audioinput' | 'audiooutput'; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, onError: () => setError('Could not switch audio device.') });
  return <Field label={label} htmlFor={'human-' + kind}><Select id={'human-' + kind} value={activeDeviceId}
    onChange={(event) => { setError(null); void setActiveMediaDevice(event.target.value).catch(() => setError('Could not switch audio device.')); }}>
    {!devices.length && <option value="">System default</option>}
    {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || label + ' ' + (index + 1)}</option>)}
  </Select>{error && <span role="alert">{error}</span>}</Field>;
}

export function HumanCallControls({ compact = false }: { compact?: boolean }) {
  const calls = useHumanCalls();
  const state = useConnectionState();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [audioError, setAudioError] = useState<string | null>(null);
  if (!calls.active) return null;
  const ending = ['ending', 'ended'].includes(calls.active.session.phase);
  const connected = state === ConnectionState.Connected;
  return <div className={compact ? 'human-call-actions' : 'human-controls'}>
    {!compact && <p role="status">Audio: {state}</p>}
    {!connected && <Button variant="secondary" size="sm" disabled={calls.busy || ending || state === ConnectionState.Connecting || state === ConnectionState.Reconnecting}
      onClick={() => void calls.join()}>Connect audio</Button>}
    {connected && <Button variant="secondary" size="sm" disabled={ending}
      onClick={() => { setAudioError(null); void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => setAudioError('Could not enable microphone. Check browser permissions.')); }}>
      {isMicrophoneEnabled ? 'Mute microphone' : 'Enable microphone'}</Button>}
    <Button size="sm" variant="dangerGhost" disabled={calls.busy || ending} onClick={() => void calls.end()}>{ending ? 'Ending…' : 'End call'}</Button>
    {!compact && connected && <><AudioDevice kind="audioinput" label="Microphone" /><AudioDevice kind="audiooutput" label="Speaker" /></>}
    {audioError && <span role="alert">{audioError}</span>}
  </div>;
}

export function HumanCallComposer({ connectionId, contact, onClose }: {
  connectionId: string; contact: { id: string; name: string; phone: string }; onClose: () => void;
}) {
  const calls = useHumanCalls(), navigate = useNavigate();
  const [trunks, setTrunks] = useState<SipTrunk[]>([]), [trunkId, setTrunkId] = useState('');
  const [selectedTools, setSelectedTools] = useState<HumanCallToolId[]>([...HUMAN_CALL_TOOL_IDS]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    let disposed = false;
    void listUserOutboundTrunks().then((rows) => {
      if (disposed) return;
      const available = rows.filter((row) => row.isActive && row.livekitTrunkId && row.numbers.length).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setTrunks(available); setTrunkId(available[0]?.id ?? '');
    }).catch((failure) => { if (!disposed) setError(failure instanceof Error ? failure.message : 'Could not load phone lines'); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, []);
  const start = async () => {
    setBusy(true); setAttempted(true); setError(null);
    try {
      const result = await calls.start({ crmIntegrationId: connectionId, crmContactId: contact.id, sipTrunkId: trunkId, requestId: requestId.current, selectedTools });
      onClose(); navigate('/dashboard/crm/call/' + result.call.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not start call'); }
    finally { setBusy(false); }
  };
  return <CrmDrawer title={'Call ' + contact.name} onClose={onClose} busy={busy}>
    <p>{contact.phone || 'No phone number'}</p><p>Open your call workspace. We’ll dial once your microphone is ready.</p>
    <p className="ops-desk-note">You have two minutes to connect. Browser departure ends the call after 15 seconds.</p>
    {error && <Alert tone="error">{error}</Alert>}{calls.error && <Alert tone="error">{calls.error}</Alert>}
    {loading ? <p>Loading phone lines…</p> : !trunks.length ? <p>Add an active outbound SIP trunk in Integrations → Dial.</p> : <>
      <Field label="Outbound phone line" htmlFor="human-call-trunk"><Select id="human-call-trunk" value={trunkId} disabled={busy || attempted} onChange={(event) => setTrunkId(event.target.value)}>
        {trunks.map((trunk) => <option key={trunk.id} value={trunk.id}>{trunk.name} · {trunk.numbers[0]}</option>)}
      </Select></Field>
      <fieldset className="human-tool-picker" disabled={busy || attempted}><legend>Select tools</legend>
        {HUMAN_CALL_TOOL_IDS.map((tool) => <label key={tool}><input type="checkbox" checked={selectedTools.includes(tool)} onChange={(event) => setSelectedTools((previous) => event.target.checked ? [...previous, tool] : previous.filter((id) => id !== tool))} />{HUMAN_TOOL_LABELS[tool]}</label>)}
        <p className="ops-desk-note">Optional. Selected tools stay available for wrap-up after the call.</p>
      </fieldset></>}
    <div className="human-call-actions"><Button disabled={!calls.enabled || Boolean(calls.active) || loading || busy || !trunkId || !contact.phone} loading={busy} onClick={() => void start()}>
      {attempted ? 'Check call request' : 'Start call'}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button></div>
  </CrmDrawer>;
}
