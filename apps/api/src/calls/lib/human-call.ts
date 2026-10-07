import { BadRequestException } from '@nestjs/common';
import { TrackSource, type ParticipantInfo } from '@livekit/protocol';
import { normalizePhone } from './call-phone';

export function humanContactPhone(contact: Record<string, unknown>): string {
  const restrictions = contact.dndSettings as
    Record<string, { status?: string; enabled?: boolean }> | undefined;
  if (
    contact.dnd === true ||
    Object.entries(restrictions ?? {}).some(
      ([key, value]) =>
        key.toLowerCase() === 'call' &&
        (value?.status === 'active' || value?.enabled === true),
    )
  ) {
    throw new BadRequestException(
      'This CRM contact has calling disabled (DND)',
    );
  }
  if (typeof contact.phone !== 'string' || !contact.phone.trim())
    throw new BadRequestException('CRM contact has no phone number');
  const raw = contact.phone.trim();
  const local = raw.replace(/[\s()-]/g, '');
  if (!raw.startsWith('+') && !/^0?\d{10}$/.test(local))
    throw new BadRequestException(
      'Use an international phone number or a ten-digit Indian number',
    );
  const phone = normalizePhone(raw);
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw new BadRequestException('CRM contact phone number is invalid');
  return phone;
}

export function humanMicrophoneReady(
  participant: ParticipantInfo | undefined,
): boolean {
  return (
    participant?.tracks.some(
      (track) => track.source === TrackSource.MICROPHONE && !track.muted,
    ) === true
  );
}

export function humanSipAnswered(
  participant: ParticipantInfo | undefined,
): boolean {
  const status = participant?.attributes?.['sip.callStatus'];
  return (
    status === 'active' ||
    status === 'automation' ||
    (!status &&
      participant?.tracks.some(
        (track) => track.source === TrackSource.MICROPHONE,
      ) === true)
  );
}
