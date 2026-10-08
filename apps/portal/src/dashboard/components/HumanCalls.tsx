import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LiveKitRoom, RoomAudioRenderer, useAudioPlayback, useConnectionQualityIndicator, useConnectionState, useIsSpeaking, useLocalParticipant, useMediaDeviceSelect } from '@livekit/components-react';
import { ConnectionState, createLocalAudioTrack, MediaDeviceFailure, Room, type LocalAudioTrack } from 'livekit-client';
import { Alert, Button, Field, Select } from '@call-agent/ui';
import { HUMAN_CALL_TOOL_IDS, type CreateHumanCallRequest, type HumanCallResponse, type HumanCallToolId, type SipTrunk } from '@call-agent/contracts';
import { createHumanCall, endHumanCall, getActiveHumanCall, getUserCall, joinHumanCall, listUserOutboundTrunks, UnauthorizedError } from '../../lib/api';
import { useUserAuth } from '../../lib/auth';
import { CrmDrawer } from '../user-pages/crm/CrmUi';
import { CallIcon } from './HumanCallIcon';
import './HumanCalls.css';

export const HUMAN_TOOL_LABELS: Record<HumanCallToolId, string> = {
  interest: 'Interested / Not interested', bookMeeting: 'Book meeting', notes: 'Notes',
};
export const HUMAN_CALL_PHASES: Record<string, string> = {
  preparing: 'Preparing call', waiting_for_user: 'Getting ready', dialing: 'Calling contact',
  connected: 'Live call', reconnecting: 'Reconnecting', ending: 'Ending call', ended: 'Call ended',
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
const microphoneMessage = (failure?: MediaDeviceFailure) => failure === MediaDeviceFailure.PermissionDenied
  ? 'Microphone permission is blocked. Allow microphone access for this site, then connect audio again.'
  : failure === MediaDeviceFailure.NotFound ? 'No microphone was found. Connect a microphone and try again.'
  : failure === MediaDeviceFailure.DeviceInUse ? 'Another application is using the microphone. Close it or choose another device.'
  : 'Could not open the microphone. Check your browser permissions and audio device.';

type AudioEvent = { at: string; event: string };
type CallsState = {
  enabled: boolean; active: HumanCallResponse | null; error: string | null; audioError: string | null; busy: boolean;
  audioCallId: string | null; diagnostics: AudioEvent[];
  start: (request: CreateHumanCallRequest, connectAudio?: boolean) => Promise<HumanCallResponse>;
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
  const location = useLocation();
  const inWorkspace = location.pathname.startsWith('/dashboard/crm/call/');
  // One room survives CRM navigation and form edits. Credentials stay in memory.
  const [room] = useState(() => new Room());
  const microphone = useRef<LocalAudioTrack | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState<HumanCallResponse | null>(null);
  const activeRef = useRef<HumanCallResponse | null>(null);
  const mutationVersion = useRef(0), mutationsPending = useRef(0), joining = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<(NonNullable<HumanCallResponse['connection']> & { callId: string }) | null>(null);
  const releaseAudio = useRef<(() => void) | null>(null);
  const disconnecting = useRef<Promise<void>>(Promise.resolve());
  const [lastCall, setLastCall] = useState<{ id: string; message: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [diagnostics, setDiagnostics] = useState<AudioEvent[]>([]);
  const record = useCallback((event: string) => setDiagnostics((old) => [...old.slice(-39), { at: new Date().toISOString(), event }]), []);
  const setDraft = useCallback((id: string, text: string | null) => setDrafts((previous) => {
    const next = { ...previous }; if (text === null) delete next[id]; else next[id] = text; return next;
  }), []);
  const detachAudio = useCallback(() => {
    setConnection(null);
    // Keep the cross-window lock until the old participant has disconnected.
    disconnecting.current = disconnecting.current.then(async () => {
      await room.disconnect(); microphone.current?.stop(); microphone.current = null;
      releaseAudio.current?.(); releaseAudio.current = null;
    });
    return disconnecting.current;
  }, [room]);
  useEffect(() => {
    if (!active && !Object.keys(drafts).length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [Boolean(active), Boolean(Object.keys(drafts).length)]);
  useEffect(() => () => { void detachAudio(); }, [detachAudio]);
  const accept = useCallback((response: HumanCallResponse | null) => {
    const previous = activeRef.current;
    if ((previous && previous.call.id !== response?.call.id) || response?.session.phase === 'ended' || response?.session.phase === 'ending') void detachAudio();
    activeRef.current = response;
    if (JSON.stringify(previous) !== JSON.stringify(response)) setActive(response);
  }, [detachAudio]);
  useEffect(() => {
    let disposed = false, running = false;
    const refresh = async () => {
      if ((document.hidden && !activeRef.current) || running || !user || mutationsPending.current) return;
      running = true;
      const version = mutationVersion.current;
      try {
        const result = await getActiveHumanCall();
        if (disposed || version !== mutationVersion.current) return;
        const previous = activeRef.current;
        setEnabled(result.enabled); accept(result.active); setError(null);
        if (previous && !result.active) {
          setLastCall({ id: previous.call.id, message: 'Call ended. Finish your wrap-up.' });
          // A failed history read must never leave ended audio attached.
          try {
            const call = await getUserCall(previous.call.id);
            if (!disposed && version === mutationVersion.current) setLastCall({ id: call.id, message: REASONS[call.humanCall?.endReason ?? ''] ?? 'Call ended. Finish your wrap-up.' });
          } catch { /* Wrap-up can load its own record; audio is already detached. */ }
        }
      } catch (failure) {
        if (!disposed && version === mutationVersion.current) {
          if (failure instanceof UnauthorizedError) logout();
          else setError('Call status is temporarily unavailable. Your audio connection is kept open.');
        }
      } finally { running = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh);
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [user?.id, logout, accept]);
  const onAudioError = useCallback(() => { record('connection_error'); setAudioError('Could not connect call audio. Check your network, then reconnect audio.'); }, [record]);
  const onMediaFailure = useCallback((failure?: MediaDeviceFailure) => { record('microphone_' + (failure ?? 'unavailable')); setAudioError(microphoneMessage(failure)); }, [record]);
  const onConnected = useCallback(() => {
    record('audio_connected');
    const track = microphone.current;
    if (!track || track.mediaStreamTrack.readyState === 'ended') { setAudioError('Enable your microphone to continue.'); return; }
    void room.localParticipant.publishTrack(track).then(() => {
      record('microphone_published'); setAudioError(null);
    }).catch((failure: Error) => onMediaFailure(MediaDeviceFailure.getFailure(failure)));
  }, [record, room, onMediaFailure]);
  const onDisconnected = useCallback(() => {
    record('audio_disconnected');
    // A manual reconnect must toggle connect even if the API returns the same token.
    setConnection(null);
  }, [record]);
  const prepareMicrophone = async () => {
    await disconnecting.current;
    if (!navigator.locks) throw new Error('Use a current browser with Web Locks support to connect call audio.');
    if (!releaseAudio.current) {
      const ownership = await navigator.locks.query();
      if (ownership.held?.some((lock) => lock.name === 'speeko-human-audio-' + user!.id)) {
        throw new Error('Audio is connected in another window. Use that window for this call.');
      }
    }
    if (microphone.current?.mediaStreamTrack.readyState === 'live') return;
    record('microphone_requested');
    try {
      microphone.current = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      record('microphone_ready');
    } catch (failure) {
      const kind = MediaDeviceFailure.getFailure(failure as Error); onMediaFailure(kind);
      throw new Error(microphoneMessage(kind));
    }
  };
  const attachAudio = async (result: HumanCallResponse) => {
    if (!result.connection) return;
    if (releaseAudio.current) { setConnection({ ...result.connection, callId: result.call.id }); return; }
    if (!navigator.locks) throw new Error('Use a current browser with Web Locks support to connect call audio.');
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request('speeko-human-audio-' + user!.id, { ifAvailable: true }, async (lock) => {
        if (!lock) { reject(new Error('Audio is connected in another window. Use that window for this call.')); return; }
        await new Promise<void>((release) => {
          releaseAudio.current = release; setConnection({ ...result.connection!, callId: result.call.id }); resolve();
        });
      }).catch(reject);
    });
  };
  const start = async (request: CreateHumanCallRequest, connectAudio = true) => {
    mutationVersion.current++; mutationsPending.current++; setAudioError(null);
    try {
      if (connectAudio) {
        // Ask permission before creating the timed API session, in the click flow.
        void room.startAudio().catch(() => undefined);
        await prepareMicrophone();
      }
      const result = await createHumanCall(request);
      accept(result); setLastCall(null); setError(null);
      if (connectAudio) try { await attachAudio(result); } catch (failure) {
        microphone.current?.stop(); microphone.current = null;
        setAudioError(failure instanceof Error ? failure.message : 'Could not connect audio');
      }
      return result;
    } catch (failure) { if (!releaseAudio.current) { microphone.current?.stop(); microphone.current = null; } throw failure; }
    finally { mutationsPending.current--; mutationVersion.current++; }
  };
  const join = async () => {
    if (!activeRef.current || joining.current || ['ending', 'ended'].includes(activeRef.current.session.phase)) return;
    joining.current = true; setBusy(true); setAudioError(null);
    const callId = activeRef.current.call.id;
    try {
      void room.startAudio().catch(() => undefined);
      await prepareMicrophone();
      const result = await joinHumanCall(callId);
      if (activeRef.current?.call.id !== callId || ['ending', 'ended'].includes(activeRef.current.session.phase)) { await detachAudio(); return; }
      await attachAudio(result);
    } catch (failure) {
      if (!releaseAudio.current) { microphone.current?.stop(); microphone.current = null; }
      setAudioError(failure instanceof Error ? failure.message : 'Could not connect audio');
    } finally { joining.current = false; setBusy(false); }
  };
  const end = async () => {
    if (!activeRef.current) return;
    mutationVersion.current++; mutationsPending.current++; setBusy(true); setError(null);
    try { accept(await endHumanCall(activeRef.current.call.id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not request hang-up'); }
    finally { mutationsPending.current--; mutationVersion.current++; setBusy(false); }
  };
  return <LiveKitRoom room={room} className="human-room" serverUrl={connection?.serverUrl} token={connection?.participantToken}
    connect={Boolean(connection)} audio={false} video={false} onConnected={onConnected} onDisconnected={onDisconnected}
    onError={onAudioError} onMediaDeviceFailure={onMediaFailure}>
    <Context.Provider value={{ enabled, active, error, audioError, busy, audioCallId: connection?.callId ?? null, diagnostics, start, join, end, drafts, setDraft }}>
      {!inWorkspace && active && <section className="human-call-strip" aria-label="Active human call">
        <CallIcon name="phone" /><div><strong>{active.session.contactName}</strong><span>{HUMAN_CALL_PHASES[active.session.phase]}</span></div>
        <div className="human-call-actions"><Link to={'/dashboard/crm/call/' + active.call.id}>Open workspace</Link><HumanCallControls compact /></div>
      </section>}
      {!inWorkspace && !active && lastCall && <div className="human-call-strip" role="status"><span>{lastCall.message}</span>
        <Link to={'/dashboard/crm/call/' + lastCall.id}>Finish wrap-up</Link>
        <Button size="sm" variant="ghost" onClick={() => setLastCall(null)}>Dismiss</Button></div>}
      {!inWorkspace && error && <Alert tone="error">{error}</Alert>}
      {!inWorkspace && audioError && <Alert tone="error">{audioError}</Alert>}
      <RoomAudioRenderer />{children}
    </Context.Provider>
  </LiveKitRoom>;
}

function AudioDevice({ kind, label }: { kind: 'audioinput' | 'audiooutput'; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, onError: () => setError('Could not switch audio device.') });
  const outputUnsupported = kind === 'audiooutput' && !('setSinkId' in HTMLMediaElement.prototype);
  return <Field label={label} htmlFor={'human-' + kind}><Select id={'human-' + kind} value={activeDeviceId} disabled={outputUnsupported}
    onChange={(event) => { setError(null); void setActiveMediaDevice(event.target.value).catch(() => setError('Could not switch audio device.')); }}>
    {!devices.length && <option value="">System default</option>}
    {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || label + ' ' + (index + 1)}</option>)}
  </Select>{outputUnsupported && <small>Uses your system audio output.</small>}{error && <span role="alert">{error}</span>}</Field>;
}

export function HumanCallControls({ compact = false }: { compact?: boolean }) {
  const calls = useHumanCalls();
  const state = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, microphoneTrack } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  const speaking = useIsSpeaking(localParticipant);
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const [audioError, setAudioError] = useState<string | null>(null), [switching, setSwitching] = useState(false);
  const [showDevices, setShowDevices] = useState(false), [copied, setCopied] = useState(false);
  if (!calls.active) return null;
  const ending = ['ending', 'ended'].includes(calls.active.session.phase);
  const connected = state === ConnectionState.Connected;
  const connecting = state === ConnectionState.Connecting || state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting;
  const microphoneReady = connected && isMicrophoneEnabled && Boolean(microphoneTrack);
  const hint = ending ? 'Audio is closing.' : state === ConnectionState.Reconnecting ? 'Reconnecting automatically. Keep this window open.'
    : !connected ? connecting ? 'Connecting your audio…' : 'Connect audio to call this contact.'
    : !microphoneReady ? 'Your microphone is muted. Enable it to speak.'
    : calls.active.session.phase === 'waiting_for_user' ? 'Microphone ready. Checking the contact and phone line…'
    : 'Your microphone is ready.';
  return <div className={compact ? 'human-call-actions' : 'human-controls'}>
    {!compact && <div className="human-audio-status">
      <span className={'human-audio-meter' + (speaking && microphoneReady ? ' is-speaking' : '')} aria-hidden="true">{[0, 1, 2, 3, 4].map((n) => <i key={n} />)}</span>
      <div><strong>{connected ? microphoneReady ? 'Microphone on' : 'Microphone muted' : connecting ? 'Connecting audio' : 'Audio not connected'}</strong><span>{hint}</span></div>
    </div>}
    <div className="human-control-buttons">
      {!connected && <Button variant="primary" size={compact ? 'sm' : 'md'} disabled={calls.busy || ending || connecting} onClick={() => void calls.join()}><CallIcon name="headphones" />Connect audio</Button>}
      {connected && <Button variant="secondary" size={compact ? 'sm' : 'md'} disabled={ending || switching} aria-pressed={!isMicrophoneEnabled}
        onClick={() => { setSwitching(true); setAudioError(null); void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
          .catch(() => setAudioError('Could not enable microphone. Check browser permissions.')).finally(() => setSwitching(false)); }}>
        <CallIcon name={isMicrophoneEnabled ? 'mic' : 'micOff'} />{isMicrophoneEnabled ? 'Mute microphone' : 'Enable microphone'}</Button>}
      <Button size={compact ? 'sm' : 'md'} variant="dangerGhost" className="human-end-call" disabled={calls.busy || ending} onClick={() => void calls.end()}><CallIcon name="phone" />{ending ? 'Ending…' : 'End call'}</Button>
    </div>
    {!compact && <>
      {connected && !canPlayAudio && <Button variant="secondary" onClick={() => void startAudio().catch(() => setAudioError('Could not enable sound. Check your browser audio settings.'))}><CallIcon name="headphones" />Enable call sound</Button>}
      <div className="human-audio-meta"><span><CallIcon name="signal" size={14} />{connected ? quality === 'unknown' ? 'Checking connection' : quality + ' connection' : 'Not connected'}</span>
        <button className="human-text-button" onClick={() => setShowDevices(!showDevices)} aria-expanded={showDevices}><CallIcon name="settings" size={14} />Audio settings</button></div>
      {showDevices && <div className="human-device-settings"><AudioDevice kind="audioinput" label="Microphone" /><AudioDevice kind="audiooutput" label="Speaker" />
        <button className="human-text-button" onClick={() => { void navigator.clipboard.writeText(JSON.stringify({ callId: calls.active!.call.id, state, quality, microphoneReady, canPlayAudio, events: calls.diagnostics }, null, 2)).then(() => setCopied(true)).catch(() => setAudioError('Could not copy diagnostics.')); }}>{copied ? 'Diagnostics copied' : 'Copy audio diagnostics'}</button>
      </div>}
    </>}
    {audioError && <span role="alert" className="human-inline-error">{audioError}</span>}
  </div>;
}

export function HumanCallComposer({ connectionId, contact, onClose }: {
  connectionId: string; contact: { id: string; name: string; phone: string }; onClose: () => void;
}) {
  const calls = useHumanCalls(), navigate = useNavigate();
  const [trunks, setTrunks] = useState<SipTrunk[]>([]), [trunkId, setTrunkId] = useState('');
  const [selectedTools, setSelectedTools] = useState<HumanCallToolId[]>([...HUMAN_CALL_TOOL_IDS]);
  const [separateWindow, setSeparateWindow] = useState(false);
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
    // Open synchronously from the click so popup blockers can report failure before dialing.
    const popup = separateWindow ? window.open('about:blank', 'speeko-call-' + requestId.current, 'popup,width=1320,height=860') : null;
    if (separateWindow && !popup) { setError('The call window was blocked. Allow popups for this site or turn off the separate-window option.'); return; }
    if (popup) { popup.document.title = 'Speeko · Opening call'; popup.document.body.textContent = 'Opening your call workspace…'; }
    setBusy(true); setError(null);
    try {
      const result = await calls.start({ crmIntegrationId: connectionId, crmContactId: contact.id, sipTrunkId: trunkId, requestId: requestId.current, selectedTools }, !separateWindow);
      setAttempted(true);
      const path = '/dashboard/crm/call/' + result.call.id;
      onClose();
      if (popup && !popup.closed) { popup.location.replace(path + '?callWindow=1'); popup.opener = null; popup.focus(); }
      else navigate(path);
    } catch (failure) { setAttempted(true); popup?.close(); setError(failure instanceof Error ? failure.message : 'Could not start call'); }
    finally { setBusy(false); }
  };
  return <CrmDrawer title="Start a call" onClose={onClose} busy={busy}>
    <div className="human-composer-contact"><span className="human-contact-avatar">{contact.name.slice(0, 1)}</span><div><strong>{contact.name}</strong><span>{contact.phone || 'No phone number'}</span></div></div>
    <p className="human-composer-intro">Everything you need for the conversation, in one focused workspace.</p>
    {error && <Alert tone="error">{error}</Alert>}{calls.error && <Alert tone="error">{calls.error}</Alert>}
    {loading ? <p>Loading phone lines…</p> : !trunks.length ? <p>Add an active outbound SIP trunk in Integrations → Dial.</p> : <>
      <Field label="Outbound phone line" htmlFor="human-call-trunk"><Select id="human-call-trunk" value={trunkId} disabled={busy || attempted} onChange={(event) => setTrunkId(event.target.value)}>
        {trunks.map((trunk) => <option key={trunk.id} value={trunk.id}>{trunk.name} · {trunk.numbers[0]}</option>)}
      </Select></Field>
      <fieldset className="human-tool-picker" disabled={busy || attempted}><legend>Select tools</legend>
        {HUMAN_CALL_TOOL_IDS.map((tool) => <label key={tool}><input type="checkbox" checked={selectedTools.includes(tool)} onChange={(event) => setSelectedTools((previous) => event.target.checked ? [...previous, tool] : previous.filter((id) => id !== tool))} />
          <CallIcon name={tool === 'interest' ? 'check' : tool === 'bookMeeting' ? 'calendar' : 'notes'} /><span>{HUMAN_TOOL_LABELS[tool]}<small>{tool === 'interest' ? 'Capture the outcome' : tool === 'bookMeeting' ? 'Schedule the next conversation' : 'Keep the details that matter'}</small></span></label>)}
      </fieldset>
      <label className="human-window-option"><input type="checkbox" checked={separateWindow} disabled={busy || attempted} onChange={(event) => setSeparateWindow(event.target.checked)} /><span>Open in a separate call window<small>Keep browsing CRM while the call stays open.</small></span><CallIcon name="external" /></label>
    </>}
    <p className="human-composer-permission"><CallIcon name="mic" size={15} />{separateWindow ? 'Connect audio in the new window to begin dialing.' : 'Allow microphone access to begin. We’ll dial when your audio is ready.'}</p>
    <div className="human-call-actions"><Button disabled={!calls.enabled || Boolean(calls.active) || loading || busy || !trunkId || !contact.phone} loading={busy} onClick={() => void start()}>
      <CallIcon name="phone" />{attempted ? 'Check call request' : 'Start call'}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button></div>
  </CrmDrawer>;
}
