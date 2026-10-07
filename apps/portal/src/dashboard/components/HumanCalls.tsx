import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Field, Select } from '@call-agent/ui';
import type {
  CreateHumanCallRequest,
  HumanCallResponse,
  SipTrunk,
} from '@call-agent/contracts';
import {
  createHumanCall,
  endHumanCall,
  getActiveHumanCall,
  getUserCall,
  joinHumanCall,
  listUserOutboundTrunks,
  UnauthorizedError,
} from '../../lib/api';
import { useUserAuth } from '../../lib/auth';
import { CrmDrawer } from '../user-pages/crm/CrmUi';
import './HumanCalls.css';

type CallsState = {
  enabled: boolean;
  active: HumanCallResponse | null;
  error: string | null;
  start: (request: CreateHumanCallRequest) => Promise<HumanCallResponse>;
};
const Context = createContext<CallsState | null>(null);
export function useHumanCalls() {
  const context = useContext(Context);
  if (!context) throw new Error('HumanCallsProvider is required');
  return context;
}
const PHASES: Record<string, string> = {
  preparing: 'Preparing call',
  waiting_for_user: 'Join Meet and enable your microphone',
  dialing: 'Dialing contact',
  connected: 'Connected',
  reconnecting: 'Reconnecting · call ends after 15 seconds away',
  ending: 'Ending call',
  ended: 'Call ended',
};
const REASONS: Record<string, string> = {
  admission_denied:
    'Calling was blocked by organization capacity, pause, or allowed hours.',
  contact_or_trunk_invalid:
    'The contact or phone line changed or is unavailable. Check the contact and start a new call.',
  validation_unavailable: 'Could not revalidate the contact or phone line.',
  no_answer: 'The contact did not answer.',
  busy: 'The contact’s line was busy.',
  join_timeout: 'The microphone join deadline expired.',
  browser_disconnected: 'The call ended after you disconnected from Meet.',
  caller_inactive: 'The caller account is no longer active.',
  preparation_failed: 'Could not prepare the call.',
  room_missing: 'The call room became unavailable.',
};

export function HumanCallsProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useUserAuth();
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState<HumanCallResponse | null>(null);
  const activeRef = useRef<HumanCallResponse | null>(null);
  const mutationVersion = useRef(0);
  const mutationsPending = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meetUrl, setMeetUrl] = useState<string | null>(null);
  const [lastCall, setLastCall] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  const accept = useCallback((response: HumanCallResponse | null) => {
    const previous = activeRef.current;
    if (previous?.call.id !== response?.call.id) setMeetUrl(null);
    activeRef.current = response;
    setActive(response);
  }, []);
  useEffect(() => {
    let disposed = false,
      running = false;
    const refresh = async () => {
      if (document.hidden || running || !user || mutationsPending.current)
        return;
      running = true;
      const version = mutationVersion.current;
      try {
        const result = await getActiveHumanCall();
        if (disposed || version !== mutationVersion.current) return;
        const previous = activeRef.current;
        if (previous && !result.active) {
          const call = await getUserCall(previous.call.id);
          if (disposed || version !== mutationVersion.current) return;
          setLastCall({
            id: call.id,
            message:
              REASONS[call.humanCall?.endReason ?? ''] ??
              'Call ended. History saved.',
          });
        }
        setEnabled(result.enabled);
        accept(result.active);
        setError(null);
      } catch (failure) {
        if (!disposed && version === mutationVersion.current) {
          if (failure instanceof UnauthorizedError) logout();
          else
            setError(
              failure instanceof Error
                ? failure.message
                : 'Could not check call status',
            );
        }
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 2000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [user?.id, logout, accept]);
  const start = async (request: CreateHumanCallRequest) => {
    mutationVersion.current++;
    mutationsPending.current++;
    try {
      const result = await createHumanCall(request);
      accept(result);
      setMeetUrl(result.meetUrl ?? null);
      setLastCall(null);
      setError(null);
      return result;
    } finally {
      mutationsPending.current--;
      mutationVersion.current++;
    }
  };
  const openMeet = async () => {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setBusy(true);
    setError(null);
    try {
      const result = await joinHumanCall(active!.call.id);
      if (result.meetUrl) {
        setMeetUrl(result.meetUrl);
        if (tab) tab.location.replace(result.meetUrl);
      }
    } catch (failure) {
      tab?.close();
      setError(
        failure instanceof Error ? failure.message : 'Could not open Meet',
      );
    } finally {
      setBusy(false);
    }
  };
  const end = async () => {
    mutationVersion.current++;
    mutationsPending.current++;
    setBusy(true);
    setError(null);
    try {
      accept(await endHumanCall(active!.call.id));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not request hang-up',
      );
    } finally {
      mutationsPending.current--;
      mutationVersion.current++;
      setBusy(false);
    }
  };
  const elapsed = active?.call.answeredAt
    ? Math.max(
        0,
        Math.floor((now - new Date(active.call.answeredAt).getTime()) / 1000),
      )
    : null;
  return (
    <Context.Provider value={{ enabled, active, error, start }}>
      {active && (
        <section className="human-call-strip" aria-label="Active human call">
          <div>
            <strong>Human call · {active.session.contactName}</strong>
            <span>
              {active.call.toNumber} · {PHASES[active.session.phase]}
              {elapsed !== null &&
                ` · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`}
            </span>
          </div>
          <div className="human-call-actions">
            <Button
              size="sm"
              variant="secondary"
              disabled={
                busy ||
                ['preparing', 'ending', 'ended'].includes(active.session.phase)
              }
              onClick={() => void openMeet()}
            >
              Open Meet
            </Button>
            <Button
              size="sm"
              variant="dangerGhost"
              disabled={busy || active.session.phase === 'ending'}
              onClick={() => void end()}
            >
              End call
            </Button>
            <Link to={`/dashboard/calls/${active.call.id}`}>Call details</Link>
            {meetUrl && (
              <a
                href={meetUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Meet link
              </a>
            )}
          </div>
          {error && (
            <Alert tone="error">
              {error} <span>Call status could not be confirmed.</span>
            </Alert>
          )}
        </section>
      )}
      {!active && lastCall && (
        <div className="human-call-strip" role="status">
          <span>{lastCall.message}</span>
          <Link to={`/dashboard/calls/${lastCall.id}`}>View history</Link>
          <Button size="sm" variant="ghost" onClick={() => setLastCall(null)}>
            Dismiss
          </Button>
        </div>
      )}
      {children}
    </Context.Provider>
  );
}

export function HumanCallComposer({
  connectionId,
  contact,
  onClose,
}: {
  connectionId: string;
  contact: { id: string; name: string; phone: string };
  onClose: () => void;
}) {
  const calls = useHumanCalls();
  const [trunks, setTrunks] = useState<SipTrunk[]>([]);
  const [trunkId, setTrunkId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    let disposed = false;
    void listUserOutboundTrunks()
      .then((rows) => {
        if (disposed) return;
        const available = rows
          .filter(
            (row) => row.isActive && row.livekitTrunkId && row.numbers.length,
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        setTrunks(available);
        setTrunkId(available[0]?.id ?? '');
      })
      .catch((failure) => {
        if (!disposed)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Could not load phone lines',
          );
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);
  const start = async () => {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setBusy(true);
    setAttempted(true);
    setError(null);
    try {
      const result = await calls.start({
        crmIntegrationId: connectionId,
        crmContactId: contact.id,
        sipTrunkId: trunkId,
        requestId: requestId.current,
      });
      if (result.meetUrl && tab) tab.location.replace(result.meetUrl);
      else tab?.close();
      onClose();
    } catch (failure) {
      tab?.close();
      setError(
        failure instanceof Error ? failure.message : 'Could not start call',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <CrmDrawer title={`Call ${contact.name}`} onClose={onClose} busy={busy}>
      <p>{contact.phone || 'No phone number'}</p>
      <p>
        Join Meet and enable your microphone. We’ll dial the contact once you’re
        ready.
      </p>
      <p className="ops-desk-note">
        You have two minutes to join. Leaving Meet ends the phone call after 15
        seconds.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {calls.error && <Alert tone="error">{calls.error}</Alert>}
      {loading ? (
        <p>Loading phone lines…</p>
      ) : !trunks.length ? (
        <p>Add an active outbound SIP trunk in Integrations → Dial.</p>
      ) : (
        <Field label="Outbound phone line" htmlFor="human-call-trunk">
          <Select
            id="human-call-trunk"
            value={trunkId}
            disabled={busy || attempted}
            onChange={(event) => setTrunkId(event.target.value)}
          >
            {trunks.map((trunk) => (
              <option key={trunk.id} value={trunk.id}>
                {trunk.name} · {trunk.numbers[0]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="human-call-actions">
        <Button
          disabled={
            !calls.enabled ||
            Boolean(calls.active) ||
            loading ||
            busy ||
            !trunkId ||
            !contact.phone
          }
          loading={busy}
          onClick={() => void start()}
        >
          {attempted ? 'Check call request' : 'Start call'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </CrmDrawer>
  );
}
