import { useMemo, useState } from 'react';
import { Alert } from '@call-agent/ui';
import { useUserAsync } from '../../hooks/useAsync';
import WhatsAppSendTab from '../WhatsAppSendTab';
import {
  CrmDrawer,
  LoadState,
  dateLabel,
  obj,
  str,
  useCrmApi,
  type Row,
} from './CrmUi';
import { appointmentContext } from '../../../lib/whatsapp-appointment';
import type { GhlContactRow } from '../../../lib/api';

export default function AppointmentWhatsApp({
  connectionId,
  calendarName,
  event,
  hasWhatsApp,
  onClose,
}: {
  connectionId: string;
  calendarName: string;
  event: Row;
  hasWhatsApp: boolean;
  onClose: () => void;
}) {
  const { api } = useCrmApi(connectionId);
  const [sending, setSending] = useState(false);
  const contactId = str(event.contactId);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const appointment = useMemo(
    () => appointmentContext(event, calendarName, timezone),
    [event, calendarName, timezone],
  );
  const contactState = useUserAsync(
    () => api('contacts.get', { id: contactId }),
    [connectionId, contactId],
  );
  const contact = useMemo<GhlContactRow | null>(() => {
    const row = obj(contactState.data?.contact);
    if (!str(row.id) || str(row.id) !== contactId) return null;
    const firstName = str(row.firstName);
    const lastName = str(row.lastName);
    return {
      id: str(row.id),
      firstName,
      lastName,
      name: str(row.name) || [firstName, lastName].filter(Boolean).join(' '),
      phone: str(row.phone).trim() || null,
      email: str(row.email) || null,
      company: str(row.companyName) || null,
      dnd: row.dnd === true,
    };
  }, [contactState.data, contactId]);
  return (
    <CrmDrawer
      title="Appointment WhatsApp message"
      onClose={onClose}
      busy={sending}
    >
      <p>
        <strong>{str(event.title) || 'Appointment'}</strong>
      </p>
      <p className="ops-desk-note">
        {dateLabel(event.startTime)} – {dateLabel(event.endTime)}
      </p>
      <p className="ops-desk-note">
        Recognized fields are auto-filled from this appointment in {timezone}.
        Review the preview before sending; use appointment fields or Custom text
        for any remaining variables.
      </p>
      <LoadState state={contactState}>
        {contact ? (
          <WhatsAppSendTab
            contactSources={[]}
            hasWhatsApp={hasWhatsApp}
            hasContacts={false}
            fixedRecipient={contact}
            appointment={appointment}
            onSendingChange={setSending}
            onGoConnections={onClose}
            onSent={() => {}}
          />
        ) : (
          <Alert tone="error">
            The appointment contact could not be found.
          </Alert>
        )}
      </LoadState>
    </CrmDrawer>
  );
}
