import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Select, Skeleton } from '@call-agent/ui';
import {
  executeUserCrm,
  getUserQueueStats,
  getUserWhatsAppAgent,
  listUserAgents,
  listUserCalls,
  listUserOrgIntegrations,
  listUserWhatsAppConversations,
  listUserWhatsAppOutboundMessages,
  pauseUserQueue,
  resumeUserQueue,
  UnauthorizedError,
  type OrgQueueStats,
} from '../../lib/api';
import { useUserAuth } from '../../lib/auth';
import { callDisplayOutcome } from '../../lib/call-outcome';
import { formatRelative } from '../../lib/format';
import { StatusBadge } from '../components/StatusBadge';
import { useUserAsync } from '../hooks/useAsync';
import { label, obj, rows, str } from './crm/CrmUi';
import '../operations-overview.css';

type Channel = 'voice' | 'whatsapp' | 'crm' | 'agents';
type Activity = {
  id: string;
  channel: Channel;
  title: string;
  detail: string;
  time: string;
  to: string;
  status: string;
  tone: string;
};
type LoadState = {
  data: unknown;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

export default function UserOverviewPage() {
  const { logout } = useUserAuth();
  const [tick, setTick] = useState(0);
  const [crmTick, setCrmTick] = useState(0);
  const [connectionId, setConnectionId] = useState('');
  const [filter, setFilter] = useState('all');
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const statsState = useUserAsync(getUserQueueStats, [tick]);
  const calls = useUserAsync(() => listUserCalls({ limit: 12 }), [tick]);
  const agents = useUserAsync(listUserAgents, [tick]);
  const conversations = useUserAsync(listUserWhatsAppConversations, [tick]);
  const messages = useUserAsync(listUserWhatsAppOutboundMessages, [tick]);
  const whatsappAgent = useUserAsync(getUserWhatsAppAgent, [tick]);
  const integrations = useUserAsync(listUserOrgIntegrations, [tick]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTick((value) => value + 1);
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = () => {
    setTick((value) => value + 1);
    setCrmTick((value) => value + 1);
  };
  const refreshing = [
    statsState,
    calls,
    agents,
    conversations,
    messages,
    whatsappAgent,
    integrations,
  ].some((state) => state.loading);
  const stats = statsState.error ? null : statsState.data;
  const connections = (
    integrations.error ? [] : (integrations.data ?? [])
  ).filter((c) => c.provider === 'ghl_crm' && c.isActive);
  const connection = connections.find((c) => c.id === connectionId);
  const whatsappConnected =
    !integrations.error &&
    integrations.data?.some((c) => c.provider === 'whatsapp' && c.isActive);
  const conversationRows = conversations.error
    ? []
    : (conversations.data ?? []);
  const messageRows = messages.error ? [] : (messages.data ?? []);
  const failedMessages = messageRows.filter(
    (m) => m.status === 'failed',
  ).length;
  const skippedMessages = messageRows.filter(
    (m) => m.status === 'skipped',
  ).length;
  const queueLabel = stats
    ? stats.queue.paused
      ? 'Paused'
      : stats.queue.enabled && stats.dialer.globalEnabled
        ? 'Running'
        : 'Disabled'
    : 'Unavailable';
  const latestConversations = [...conversationRows].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  const activity: Activity[] = [
    ...(calls.error ? [] : (calls.data ?? [])).map((c) => {
      const outcome = callDisplayOutcome(c);
      return {
        id: `call-${c.id}`,
        channel: 'voice' as const,
        title: c.toNumber || c.participantIdentity || 'Voice call',
        detail: `${c.direction} call`,
        time: c.createdAt,
        to: `/dashboard/calls/${c.id}`,
        status: outcome.label,
        tone: outcome.tone,
      };
    }),
    ...messageRows.map((m) => ({
      id: `message-${m.id}`,
      channel: 'whatsapp' as const,
      title: m.contactName || m.phone,
      detail: m.templateName,
      time: m.createdAt,
      to: '/dashboard/whatsapp?tab=history',
      status:
        m.status === 'sent'
          ? 'Sent'
          : m.status === 'failed'
            ? 'Failed'
            : 'Skipped',
      tone:
        m.status === 'sent'
          ? 'success'
          : m.status === 'failed'
            ? 'danger'
            : 'warn',
    })),
    ...conversationRows.map((c) => ({
      id: `conversation-${c.id}`,
      channel: 'whatsapp' as const,
      title: c.sender,
      detail: 'Agent conversation updated',
      time: c.updatedAt,
      to: '/dashboard/whatsapp?tab=history',
      status: 'Conversation',
      tone: 'neutral',
    })),
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const visibleActivity = activity
    .filter((item) => filter === 'all' || item.channel === filter)
    .slice(0, 3);
  const activityError = Boolean(
    calls.error || messages.error || conversations.error,
  );
  const attention = [
    ...(statsState.error
      ? [
          {
            title: 'Voice overview unavailable',
            detail: statsState.error,
            to: '/dashboard/queue',
          },
        ]
      : []),
    ...(stats?.dialer.lastError
      ? [
          {
            title: 'Dialer needs a look',
            detail: stats.dialer.lastError,
            to: '/dashboard/queue',
          },
        ]
      : []),
    ...(stats?.queue.paused
      ? [
          {
            title: 'Outbound queue is paused',
            detail: `${stats.counts.pending} calls waiting in the queue`,
            to: '/dashboard/queue',
          },
        ]
      : []),
    ...(stats && !stats.queue.enabled
      ? [
          {
            title: 'Outbound queue is disabled',
            detail: 'Review queue settings to enable outbound processing',
            to: '/dashboard/queue',
          },
        ]
      : []),
    ...(stats && !stats.dialer.globalEnabled
      ? [
          {
            title: 'Outbound dialer is off',
            detail: 'Queue processing is disabled at platform level',
            to: '/dashboard/queue',
          },
        ]
      : []),
    ...(stats && stats.batches.paused > 0
      ? [
          {
            title: `${stats.batches.paused} paused ${stats.batches.paused === 1 ? 'batch' : 'batches'}`,
            detail: 'Review campaigns waiting to continue',
            to: '/dashboard/batches',
          },
        ]
      : []),
    ...(failedMessages > 0
      ? [
          {
            title: `${failedMessages} failed template ${failedMessages === 1 ? 'send' : 'sends'}`,
            detail: 'In recent send history · inspect before resending',
            to: '/dashboard/whatsapp?tab=history',
          },
        ]
      : []),
    ...(integrations.error
      ? [
          {
            title: 'Connections unavailable',
            detail: integrations.error,
            to: '/dashboard/integrations',
          },
        ]
      : []),
    ...(messages.error || conversations.error || whatsappAgent.error
      ? [
          {
            title: 'WhatsApp overview incomplete',
            detail: 'Some WhatsApp data could not be loaded',
            to: '/dashboard/whatsapp?tab=history',
          },
        ]
      : []),
    ...(agents.error
      ? [
          {
            title: 'Agent overview unavailable',
            detail: agents.error,
            to: '/dashboard/agents',
          },
        ]
      : []),
  ];

  const toggleQueue = async () => {
    if (!stats || queueBusy) return;
    setQueueBusy(true);
    setQueueError(null);
    try {
      if (stats.queue.paused) await resumeUserQueue();
      else await pauseUserQueue();
      statsState.reload();
    } catch (error) {
      if (error instanceof UnauthorizedError) logout();
      else
        setQueueError(
          error instanceof Error
            ? error.message
            : 'Queue action failed. Refresh the queue before trying again.',
        );
    } finally {
      setQueueBusy(false);
    }
  };

  return (
    <div className="ops-overview">
      <header className="overview-header">
        <div>
          <span className="overview-eyebrow">
            Your organization, at a glance
          </span>
          <h1>
            Operations overview
            <span className="overview-title-dot" aria-hidden>
              .
            </span>
          </h1>
          <p>Every conversation. Every channel. One clear picture.</p>
        </div>
        <div className="overview-header-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
          >
            <Icon kind="refresh" /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button
            as="a"
            href="/dashboard/calls?compose=enqueue"
            size="sm"
            variant="primary"
          >
            <span aria-hidden>+</span> Start calling
          </Button>
        </div>
      </header>

      <div className="overview-metrics">
        <Metric
          channel="voice"
          label="Calls in progress"
          value={
            stats
              ? stats.counts.creating +
                stats.counts.dialing +
                stats.counts.ready
              : undefined
          }
          hint={
            stats
              ? `${stats.counts.pending} queued · ${stats.counts.ready} live`
              : 'Current voice activity'
          }
          to="/dashboard/calls?bucket=in_progress"
          state={statsState}
        />
        <Metric
          channel="whatsapp"
          label="Recent conversations"
          value={conversations.data?.length}
          hint="Latest 50 WhatsApp agent conversations"
          to="/dashboard/whatsapp?tab=history"
          state={conversations}
        />
        <Metric
          channel="crm"
          label="CRM connections"
          value={integrations.data ? connections.length : undefined}
          hint="Active HighLevel connections"
          to="/dashboard/crm"
          state={integrations}
        />
        <Metric
          channel="agents"
          label="Active voice agents"
          value={agents.data?.filter((a) => a.isActive).length}
          hint={
            agents.data
              ? `${agents.data.length} configured in your organization`
              : 'Your named agent configurations'
          }
          to="/dashboard/agents"
          state={agents}
        />
      </div>

      <div className="overview-channels">
        <section
          className="overview-panel overview-voice"
          aria-labelledby="overview-voice-title"
        >
          <PanelHead
            channel="voice"
            title="Voice"
            id="overview-voice-title"
            to="/dashboard/calls"
          />
          <SectionState state={statsState} label="voice activity">
            {stats && (
              <>
                <div className="overview-channel-heading">
                  <span>Outbound queue</span>
                  <StatusBadge
                    status={
                      stats.queue.paused
                        ? 'warn'
                        : stats.queue.enabled && stats.dialer.globalEnabled
                          ? 'running'
                          : 'disabled'
                    }
                    label={queueLabel}
                  />
                </div>
                <div className="overview-voice-numbers">
                  <strong>
                    {stats.daily
                      .reduce((n, d) => n + d.completed, 0)
                      .toLocaleString()}
                  </strong>
                  <div>
                    completed AI calls<span>Last 14 days · UTC</span>
                  </div>
                  <span className="overview-rate">
                    {completionRate(stats)}
                    <small>completion</small>
                  </span>
                </div>
                <VolumeChart stats={stats} />
                <div className="overview-capacity">
                  <span>Outbound capacity</span>
                  <strong>
                    {stats.queue.inProgress} / {stats.queue.maxConcurrent}
                  </strong>
                </div>
                <progress
                  className="overview-progress"
                  max={Math.max(1, stats.queue.maxConcurrent)}
                  value={stats.queue.inProgress}
                  aria-label="Outbound call slots in use"
                />
                <div className="overview-channel-foot">
                  <Link to="/dashboard/batches">
                    {stats.batches.running} running batches ↗
                  </Link>
                  <button
                    type="button"
                    onClick={toggleQueue}
                    disabled={queueBusy || !stats.queue.enabled}
                  >
                    {queueBusy
                      ? 'Updating…'
                      : stats.queue.paused
                        ? 'Resume queue'
                        : 'Pause queue'}
                  </button>
                </div>
              </>
            )}
          </SectionState>
          {queueError && <Alert tone="error">{queueError}</Alert>}
        </section>

        <section
          className="overview-panel overview-whatsapp"
          aria-labelledby="overview-whatsapp-title"
        >
          <PanelHead
            channel="whatsapp"
            title="WhatsApp"
            id="overview-whatsapp-title"
            to="/dashboard/whatsapp"
          />
          <div className="overview-channel-heading">
            <span>Customer messaging</span>
            <StatusBadge
              status={
                integrations.error
                  ? 'warn'
                  : whatsappConnected
                    ? 'success'
                    : 'neutral'
              }
              label={
                integrations.loading && !integrations.data
                  ? 'Loading'
                  : integrations.error
                    ? 'Unavailable'
                    : whatsappConnected
                      ? 'Configured'
                      : 'Not connected'
              }
            />
          </div>
          <SectionState state={messages} label="template sends">
            <div className="overview-wa-numbers">
              <div>
                <strong>
                  {messageRows.filter((m) => m.status === 'sent').length}
                </strong>
                <span>sent</span>
              </div>
              <div>
                <strong>{failedMessages}</strong>
                <span>failed</span>
              </div>
              <div>
                <strong>{skippedMessages}</strong>
                <span>skipped</span>
              </div>
            </div>
            <p className="overview-caption">
              Recent template send history · {messageRows.length} records
            </p>
          </SectionState>
          <div className="overview-subheading">
            Latest conversations
            <Link to="/dashboard/whatsapp?tab=history">History ↗</Link>
          </div>
          <SectionState state={conversations} label="conversations">
            {latestConversations.length ? (
              <ul className="overview-conversations">
                {latestConversations.slice(0, 2).map((c) => (
                  <li key={c.id}>
                    <Link to="/dashboard/whatsapp?tab=history">
                      <span className="overview-contact-mark" aria-hidden>
                        <Icon kind="whatsapp" />
                      </span>
                      <span className="overview-conversation-copy">
                        <strong>{c.sender}</strong>
                        <span>Conversation updated</span>
                      </span>
                      <time dateTime={c.updatedAt}>
                        {formatRelative(c.updatedAt)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="overview-empty-inline">
                Conversations will appear here when customers message you.
              </p>
            )}
          </SectionState>
          <div className="overview-channel-foot">
            <Link to="/dashboard/whatsapp?tab=agent">
              {whatsappAgent.error
                ? 'Agent unavailable'
                : !whatsappAgent.data
                  ? 'Loading agent…'
                  : whatsappAgent.data.whatsappTaskId ||
                      whatsappAgent.data.taskKey
                    ? 'Agent task configured'
                    : 'Set up an agent'}{' '}
              ↗
            </Link>
            <Link to="/dashboard/whatsapp?tab=send">Send template ↗</Link>
          </div>
        </section>

        <section
          className="overview-panel overview-crm"
          aria-labelledby="overview-crm-title"
        >
          <PanelHead
            channel="crm"
            title="CRM"
            id="overview-crm-title"
            to={
              connection
                ? `/dashboard/crm?connection=${encodeURIComponent(connection.id)}`
                : '/dashboard/crm'
            }
          />
          <SectionState state={integrations} label="CRM connections">
            {connections.length ? (
              <>
                <label
                  className="overview-select-label"
                  htmlFor="overview-crm-connection"
                >
                  HighLevel connection
                </label>
                <Select
                  id="overview-crm-connection"
                  value={connection?.id ?? ''}
                  onChange={(e) => setConnectionId(e.target.value)}
                >
                  <option value="">Select a connection</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                {connection ? (
                  <CrmSnapshot
                    key={connection.id}
                    connectionId={connection.id}
                    refreshKey={crmTick}
                  />
                ) : (
                  <div className="overview-crm-empty">
                    <Icon kind="crm" />
                    <strong>Your customer pipeline, here.</strong>
                    <p>
                      Choose a connection to see contacts and open
                      opportunities.
                    </p>
                    <Link to="/dashboard/crm">Open CRM workspace ↗</Link>
                  </div>
                )}
              </>
            ) : (
              <div className="overview-crm-empty">
                <Icon kind="crm" />
                <strong>Bring your customer journey together.</strong>
                <p>
                  Connect HighLevel to see contacts and opportunities alongside
                  your conversations.
                </p>
                <Link to="/dashboard/integrations?tab=crm">
                  Connect your CRM ↗
                </Link>
              </div>
            )}
          </SectionState>
        </section>
      </div>

      <div className="overview-bottom">
        <section
          className="overview-panel overview-activity"
          aria-labelledby="overview-activity-title"
        >
          <div className="overview-section-head">
            <div>
              <h2 id="overview-activity-title">Recent activity</h2>
              <span>Latest calls and WhatsApp updates</span>
            </div>
            <div
              className="overview-filters"
              role="group"
              aria-label="Activity channel"
            >
              {['all', 'voice', 'whatsapp'].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  className={filter === value ? 'is-selected' : ''}
                  onClick={() => setFilter(value)}
                >
                  {value === 'all'
                    ? 'All'
                    : value === 'voice'
                      ? 'Voice'
                      : 'WhatsApp'}
                </button>
              ))}
            </div>
          </div>
          {activityError && (
            <div className="overview-partial" role="status">
              Some activity is unavailable.{' '}
              <button type="button" onClick={refresh} disabled={refreshing}>
                Retry
              </button>
            </div>
          )}
          {visibleActivity.length ? (
            <ol className="overview-activity-list">
              {visibleActivity.map((item) => (
                <li key={item.id}>
                  <Link to={item.to}>
                    <span
                      className={`overview-channel-icon is-${item.channel}`}
                      aria-hidden
                    >
                      <Icon kind={item.channel} />
                    </span>
                    <span className="overview-activity-copy">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    <StatusBadge status={item.tone} label={item.status} />
                    <time dateTime={item.time}>
                      {formatRelative(item.time)}
                    </time>
                    <span className="overview-row-arrow" aria-hidden>
                      ↗
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="overview-activity-empty">
              {calls.loading || conversations.loading || messages.loading ? (
                <Skeleton variant="block" height={100} />
              ) : (
                <>
                  <strong>
                    {activityError
                      ? 'Activity is unavailable'
                      : 'A little quiet here, for now.'}
                  </strong>
                  <p>
                    {activityError
                      ? 'Refresh to load the latest updates.'
                      : 'Your latest calls and WhatsApp updates will appear here.'}
                  </p>
                </>
              )}
            </div>
          )}
        </section>

        <aside
          className="overview-panel overview-attention"
          aria-labelledby="overview-attention-title"
        >
          <div className="overview-section-head">
            <div>
              <h2 id="overview-attention-title">
                Needs attention{' '}
                <span className="overview-attention-count">
                  {attention.length}
                </span>
              </h2>
              <span>Your next things to check</span>
            </div>
            <Icon kind="attention" />
          </div>
          {attention.length ? (
            <ul className="overview-attention-list">
              {attention.map((item) => (
                <li key={item.title}>
                  <Link to={item.to}>
                    <span className="overview-attention-marker" aria-hidden />
                    <span>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    <span aria-hidden>↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overview-all-clear">
              <span aria-hidden>✓</span>
              <div>
                <strong>
                  {refreshing
                    ? 'Checking your operations…'
                    : 'No flagged issues'}
                </strong>
                <p>
                  {refreshing
                    ? 'Gathering the latest channel updates.'
                    : 'No queue or recent send issues to review.'}
                </p>
              </div>
            </div>
          )}
          <div className="overview-attention-foot">
            <Link to="/dashboard/integrations">Manage connections ↗</Link>
            <Link to="/dashboard/queue">Queue settings ↗</Link>
          </div>
        </aside>
      </div>
      <footer className="overview-footer">
        <span>Auto-refresh every 30 seconds · CRM refreshes on request</span>
        <span>
          {stats
            ? `Voice snapshot ${formatRelative(stats.asOf)}`
            : 'Organization operations'}
        </span>
      </footer>
    </div>
  );
}

function CrmSnapshot({
  connectionId,
  refreshKey,
}: {
  connectionId: string;
  refreshKey: number;
}) {
  const contacts = useUserAsync(
    () =>
      executeUserCrm(connectionId, {
        action: 'contacts.list',
        params: { limit: 50 },
      }),
    [refreshKey],
  );
  const opportunities = useUserAsync(
    () =>
      executeUserCrm(connectionId, {
        action: 'opportunities.list',
        params: { status: 'open', limit: 50, page: 1 },
      }),
    [refreshKey],
  );
  const contactRows = rows(contacts.data?.contacts);
  const deals = rows(opportunities.data?.opportunities);
  const to = `/dashboard/crm?connection=${encodeURIComponent(connectionId)}`;
  return (
    <div className="overview-crm-snapshot">
      <div className="overview-crm-facts">
        <SnapshotMetric
          state={contacts}
          count={contactRows.length}
          to={to}
          label="contacts in view"
        />
        <SnapshotMetric
          state={opportunities}
          count={deals.length}
          to={`${to}&tab=opportunities`}
          label="open deals in view"
        />
      </div>
      <p className="overview-caption">
        First 50 records per section · live from HighLevel
      </p>
      {contacts.error && (
        <SectionState state={contacts} label="contacts">
          {null}
        </SectionState>
      )}
      <div className="overview-subheading">
        Open opportunities<Link to={`${to}&tab=opportunities`}>Pipeline ↗</Link>
      </div>
      <SectionState state={opportunities} label="opportunities">
        {deals.length ? (
          <ul className="overview-deals">
            {deals.slice(0, 2).map((deal, i) => (
              <li key={str(deal.id) || i}>
                <Link to={`${to}&tab=opportunities`}>
                  <span>
                    <strong>{label(deal) || 'Opportunity'}</strong>
                    <span>
                      {label(obj(deal.contact)) || 'Open opportunity'}
                    </span>
                  </span>
                  <span aria-hidden>↗</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="overview-empty-inline">
            No open opportunities in this connection.
          </p>
        )}
      </SectionState>
      <div className="overview-channel-foot">
        <Link to={`${to}&tab=contacts`}>Contacts ↗</Link>
        <Link to={`${to}&tab=calendar`}>Calendar ↗</Link>
      </div>
    </div>
  );
}

function SnapshotMetric({
  state,
  count,
  to,
  label: title,
}: {
  state: LoadState;
  count: number;
  to: string;
  label: string;
}) {
  return (
    <Link to={to}>
      {state.loading && state.data === null ? (
        <Skeleton width={40} height={27} />
      ) : (
        <strong>{state.error ? '—' : count.toLocaleString()}</strong>
      )}
      <span>
        {title}
        {state.error ? ' · unavailable' : ''}
      </span>
    </Link>
  );
}

function Metric({
  channel,
  label: title,
  value,
  hint,
  to,
  state,
}: {
  channel: Channel;
  label: string;
  value?: number;
  hint: string;
  to: string;
  state: LoadState;
}) {
  return (
    <Link to={to} className={`overview-metric is-${channel}`}>
      <div className="overview-metric-top">
        <span>{title}</span>
        <Icon kind={channel} />
      </div>
      {state.loading && state.data === null ? (
        <Skeleton width={55} height={30} />
      ) : (
        <strong>
          {state.error || value == null ? '—' : value.toLocaleString()}
        </strong>
      )}
      <span className="overview-metric-hint">
        {state.error ? 'Unavailable · open to review' : hint}
      </span>
      <span className="overview-metric-arrow" aria-hidden>
        ↗
      </span>
    </Link>
  );
}

function PanelHead({
  channel,
  title,
  id,
  to,
}: {
  channel: Channel;
  title: string;
  id: string;
  to: string;
}) {
  return (
    <div className="overview-panel-head">
      <div>
        <span className={`overview-channel-icon is-${channel}`} aria-hidden>
          <Icon kind={channel} />
        </span>
        <h2 id={id}>{title}</h2>
      </div>
      <Link to={to} aria-label={`Open ${title}`}>
        <Icon kind="arrow" />
      </Link>
    </div>
  );
}

function SectionState({
  state,
  label: name,
  children,
}: {
  state: LoadState;
  label: string;
  children: ReactNode;
}) {
  if (state.error)
    return (
      <div className="overview-load-error">
        <p>{state.error}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={state.reload}
          disabled={state.loading}
        >
          Retry {name}
        </Button>
      </div>
    );
  if (state.loading && state.data === null)
    return (
      <div
        className="overview-loading"
        role="status"
        aria-label={`Loading ${name}`}
      >
        <Skeleton variant="block" height={50} />
        <Skeleton width="75%" />
      </div>
    );
  return <>{children}</>;
}

function completionRate(stats: OrgQueueStats) {
  const completed = stats.daily.reduce((n, d) => n + d.completed, 0);
  const finished = stats.daily.reduce(
    (n, d) => n + d.completed + (d.incomplete ?? 0) + d.failed + d.cancelled,
    0,
  );
  return finished ? `${Math.round((completed / finished) * 100)}%` : '—';
}

function VolumeChart({ stats }: { stats: OrgQueueStats }) {
  const daily = stats.daily;
  const max = Math.max(
    1,
    ...daily.map(
      (d) => d.completed + (d.incomplete ?? 0) + d.failed + d.cancelled,
    ),
  );
  return (
    <div className="overview-chart">
      <div
        className="overview-chart-bars"
        role="img"
        aria-label={`Daily call outcomes, last 14 days: ${daily.map((d) => `${d.date}: ${d.completed} completed, ${d.incomplete ?? 0} incomplete, ${d.failed} failed, ${d.cancelled} cancelled`).join('; ') || 'No calls'}`}
      >
        {daily.length ? (
          daily.map((d) => (
            <div
              key={d.date}
              className="overview-chart-slot"
              title={`${d.date} · ${d.completed} completed · ${d.incomplete ?? 0} incomplete · ${d.failed} failed · ${d.cancelled} cancelled`}
            >
              <div
                className="overview-chart-bar"
                style={{
                  height: `${((d.completed + (d.incomplete ?? 0) + d.failed + d.cancelled) / max) * 100}%`,
                }}
              >
                <span
                  className="is-completed"
                  style={{ flexGrow: d.completed }}
                />
                <span
                  className="is-incomplete"
                  style={{ flexGrow: d.incomplete ?? 0 }}
                />
                <span className="is-failed" style={{ flexGrow: d.failed }} />
                <span
                  className="is-cancelled"
                  style={{ flexGrow: d.cancelled }}
                />
              </div>
            </div>
          ))
        ) : (
          <span className="overview-caption">No call outcomes yet</span>
        )}
      </div>
      <div className="overview-chart-key">
        <span>
          <i className="is-completed" />
          Completed
        </span>
        <span>
          <i className="is-incomplete" />
          Incomplete
        </span>
        <span>
          <i className="is-failed" />
          Failed
        </span>
        <span>
          <i className="is-cancelled" />
          Cancelled
        </span>
      </div>
    </div>
  );
}

function Icon({ kind }: { kind: Channel | 'refresh' | 'arrow' | 'attention' }) {
  const paths = {
    voice:
      'M5 3h4l2 5-3 2a14 14 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2Z',
    whatsapp:
      'M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 21l2-5.3A8.5 8.5 0 1 1 21 11.5ZM8 10h8M8 13h5',
    crm: 'M4 5h16v14H4zM4 10h16M9 10v9M14 10v9',
    agents:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M20 21v-2a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 3a4 4 0 0 1 0 8',
    refresh:
      'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1',
    arrow: 'M7 17 17 7M7 7h10v10',
    attention: 'M12 3 2 21h20L12 3ZM12 9v5M12 17v.1',
  };
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
