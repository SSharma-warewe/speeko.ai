import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@call-agent/ui";
import { useUserAsync } from "../../hooks/useAsync";
import {
  Feedback,
  LoadState,
  Panel,
  dateLabel,
  label,
  obj,
  rows,
  str,
  useCrmApi,
  type Row,
} from "./CrmUi";

export default function CrmConversations({
  connectionId,
}: {
  connectionId: string;
}) {
  const { api, busy, error, notice, mutate } = useCrmApi(connectionId);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<Row | null>(null);
  const [messageCursor, setMessageCursor] = useState<string | undefined>();
  const [channel, setChannel] = useState("SMS");
  const [message, setMessage] = useState("");
  const conversations = useUserAsync(
    () => api("conversations.list", { query: search, cursor, limit: 50 }),
    [search, cursor],
  );
  const messages = useUserAsync(
    () =>
      selected
        ? api("messages.list", {
            id: selected.id,
            cursor: messageCursor,
            limit: 50,
          })
        : Promise.resolve({ messages: {} }),
    [selected?.id, messageCursor],
  );
  const envelope = obj(messages.data?.messages);
  const thread = rows(envelope.messages).slice().reverse();
  const list = rows(conversations.data?.conversations);
  return (
    <div className="crm-stack">
      <Feedback error={error} notice={notice} />
      <div className="crm-inbox">
        <Panel title="Conversations">
          <form
            className="crm-search"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query);
              setCursor(undefined);
            }}
          >
            <Input
              aria-label="Search conversations"
              placeholder="Search conversations"
              value={query}
              maxLength={120}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" size="sm" variant="secondary">
              Search
            </Button>
          </form>
          <LoadState state={conversations}>
            {!list.length && <p>No conversations found.</p>}
            {list.map((conversation) => (
              <button
                className={`crm-thread-button${selected?.id === conversation.id ? " is-selected" : ""}`}
                key={str(conversation.id)}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelected(conversation);
                  setMessageCursor(undefined);
                  setMessage("");
                }}
              >
                <strong>{label(conversation)}</strong>
                <span>
                  {str(conversation.lastMessageBody) || "Open conversation"}
                </span>
                <small>{dateLabel(conversation.lastMessageDate)}</small>
              </button>
            ))}
            <div className="crm-pagination">
              {cursor && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCursor(undefined)}
                >
                  Latest
                </Button>
              )}
              {list.length >= 50 && Boolean(list.at(-1)?.lastMessageDate) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCursor(str(list.at(-1)?.lastMessageDate))}
                >
                  Older conversations
                </Button>
              )}
            </div>
          </LoadState>
        </Panel>
        <Panel
          title={selected ? label(selected) : "Message history"}
          actions={
            selected && (
              <Button size="sm" variant="ghost" onClick={messages.reload}>
                Refresh
              </Button>
            )
          }
        >
          {!selected ? (
            <p className="ops-desk-note">
              Select a conversation to read its history and reply from your
              HighLevel channel.
            </p>
          ) : (
            <>
              <LoadState state={messages}>
                <div className="crm-messages">
                  {envelope.nextPage === true &&
                    Boolean(envelope.lastMessageId) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setMessageCursor(str(envelope.lastMessageId))
                        }
                      >
                        Earlier messages
                      </Button>
                    )}
                  {messageCursor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMessageCursor(undefined)}
                    >
                      Back to latest
                    </Button>
                  )}
                  {thread.map((item) => (
                    <article
                      key={str(item.id)}
                      className={`crm-message ${item.direction === "outbound" ? "is-outbound" : ""}`}
                    >
                      <small>
                        {str(item.direction)} · {str(item.messageType)} ·{" "}
                        {dateLabel(item.dateAdded)}
                      </small>
                      <p className="crm-text">
                        {str(item.body) || "Message has no text body."}
                      </p>
                      {Array.isArray(item.attachments) &&
                        item.attachments.length > 0 && (
                          <small>{item.attachments.length} attachment(s)</small>
                        )}
                      <small>{str(item.status)}</small>
                    </article>
                  ))}
                  {!thread.length && <p>No messages in this conversation.</p>}
                </div>
              </LoadState>
              <form
                className="ops-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    !window.confirm(
                      `Send this ${channel} message to ${label(selected)} through HighLevel?`,
                    )
                  )
                    return;
                  void mutate(async () => {
                    await api("messages.send", {
                      contactId: selected.contactId,
                      data: { type: channel, message },
                    });
                    setMessage("");
                    setMessageCursor(undefined);
                    messages.reload();
                    conversations.reload();
                  }, "HighLevel accepted the message. Delivery status appears in the conversation.");
                }}
              >
                <Field label="Reply through" htmlFor="crm-channel">
                  <Select
                    id="crm-channel"
                    disabled={busy}
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                  >
                    <option value="SMS">SMS</option>
                    <option value="WhatsApp">HighLevel WhatsApp</option>
                  </Select>
                </Field>
                <Field label="Message" htmlFor="crm-message" required>
                  <Textarea
                    id="crm-message"
                    disabled={busy}
                    required
                    maxLength={5000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                  />
                </Field>
                <p className="ops-desk-note">
                  Uses the channel connected to this HighLevel location. Do Not
                  Disturb and provider restrictions apply. SMS and WhatsApp
                  charges follow your HighLevel account.
                </p>
                <Button
                  type="submit"
                  loading={busy}
                  disabled={!selected.contactId || !message.trim()}
                >
                  Send message
                </Button>
              </form>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
