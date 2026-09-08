/**
 * Get-demo lead quality: real person names + company work emails.
 * Shared by RequestDemoDto (API) and GetDemoPage (marketing).
 */

export const DEMO_PERSON_NAME_MIN_LENGTH = 2;
export const DEMO_PERSON_NAME_MAX_LENGTH = 100;

export const DEMO_PERSON_NAME_MESSAGE = 'Enter a real first and last name.';
export const DEMO_WORK_EMAIL_MESSAGE =
  'Use your work email (not Gmail, Yahoo, Outlook, or a temporary address).';

/** Placeholder / junk tokens (folded, letters-only). */
const PLACEHOLDER_NAME_TOKENS = new Set([
  'abc',
  'admin',
  'anonymous',
  'asd',
  'asdf',
  'asdfg',
  'asdfgh',
  'bar',
  'baz',
  'blah',
  'demo',
  'dummy',
  'fake',
  'first',
  'firstname',
  'fname',
  'foo',
  'guest',
  'last',
  'lastname',
  'lname',
  'na',
  'name',
  'nil',
  'none',
  'null',
  'placeholder',
  'qwe',
  'qwer',
  'qwerty',
  'qwertyuiop',
  'sample',
  'spam',
  'temp',
  'temporary',
  'test',
  'tester',
  'testing',
  'testtest',
  'unknown',
  'user',
  'xxx',
  'xyz',
  'yyy',
  'zzz',
]);

/** Folded first+last pairs that are classic placeholders. */
const PLACEHOLDER_NAME_PAIRS = new Set(['foobar', 'janedoe', 'johndoe']);

const NAME_SHAPE = /^[\p{L}][\p{L}\s'.-]*[\p{L}]$/u;

const RESERVED_EMAIL_TLDS = new Set([
  'example',
  'invalid',
  'local',
  'localhost',
  'test',
]);

const RESERVED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.edu',
  'example.net',
  'example.org',
]);

/** Consumer / free / ISP inboxes — not a company work domain. */
const FREE_EMAIL_DOMAINS = new Set([
  'aol.com',
  'aol.co.uk',
  'att.net',
  'comcast.net',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'gmail.com',
  'googlemail.com',
  'hotmail.ca',
  'hotmail.co.uk',
  'hotmail.com',
  'hotmail.com.au',
  'hotmail.de',
  'hotmail.es',
  'hotmail.fr',
  'hotmail.it',
  'icloud.com',
  'inbox.com',
  'live.co.uk',
  'live.com',
  'mac.com',
  'mail.com',
  'mail.ru',
  'me.com',
  'msn.com',
  'outlook.co.uk',
  'outlook.com',
  'outlook.de',
  'outlook.fr',
  'pm.me',
  'proton.me',
  'protonmail.ch',
  'protonmail.com',
  'qq.com',
  'rediffmail.com',
  'rocketmail.com',
  'sbcglobal.net',
  'tuta.io',
  'tutanota.com',
  'verizon.net',
  'yahoo.ca',
  'yahoo.co.in',
  'yahoo.co.jp',
  'yahoo.co.uk',
  'yahoo.com',
  'yahoo.com.au',
  'yahoo.com.br',
  'yahoo.de',
  'yahoo.es',
  'yahoo.fr',
  'yahoo.it',
  'yandex.com',
  'yandex.ru',
  'ymail.com',
]);

/** Common disposable / temporary inboxes. */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com',
  '10minutemail.net',
  'bccto.me',
  'discard.email',
  'dispostable.com',
  'emailfake.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'getairmail.com',
  'grr.la',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'inboxkitten.com',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailnesia.com',
  'mailsac.com',
  'mintemail.com',
  'mohmal.com',
  'mytemp.email',
  'sharklasers.com',
  'spam4.me',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempmail.com',
  'tempmailo.com',
  'throwaway.email',
  'tmpeml.com',
  'tmpmail.org',
  'trashmail.com',
  'trashmail.net',
  'trashmailer.com',
  'yopmail.com',
  'yopmail.fr',
]);

function foldPersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim();
}

function lettersOnly(value: string): string {
  return value.replace(/[^\p{L}]/gu, '');
}

function nameTokens(folded: string): string[] {
  return folded.split(/[\s'./-]+/g).filter(Boolean);
}

function isRepeatedLetterName(letters: string): boolean {
  if (letters.length < DEMO_PERSON_NAME_MIN_LENGTH) return false;
  const first = letters[0];
  return [...letters].every((ch) => ch === first);
}

export function isDemoPersonName(value: string): boolean {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (
    trimmed.length < DEMO_PERSON_NAME_MIN_LENGTH ||
    trimmed.length > DEMO_PERSON_NAME_MAX_LENGTH
  ) {
    return false;
  }
  if (!NAME_SHAPE.test(trimmed)) return false;

  const letters = lettersOnly(trimmed);
  if (letters.length < DEMO_PERSON_NAME_MIN_LENGTH) return false;
  if (isRepeatedLetterName(lettersOnly(foldPersonName(trimmed)))) return false;

  const folded = foldPersonName(trimmed);
  const foldedLetters = lettersOnly(folded);
  if (PLACEHOLDER_NAME_TOKENS.has(foldedLetters)) return false;
  for (const token of nameTokens(folded)) {
    if (PLACEHOLDER_NAME_TOKENS.has(lettersOnly(token))) return false;
  }
  return true;
}

/** Both given + family names look real and are not a known fake pair. */
export function isDemoFullName(firstName: string, lastName: string): boolean {
  if (!isDemoPersonName(firstName) || !isDemoPersonName(lastName)) return false;
  const pair = `${lettersOnly(foldPersonName(firstName))}${lettersOnly(foldPersonName(lastName))}`;
  return !PLACEHOLDER_NAME_PAIRS.has(pair);
}

/** RFC-lite shape used by the marketing form (mirrors prior GetDemoPage check). */
export function isDemoEmailShape(value: string): boolean {
  const email = value.trim();
  if (!email || email.length > 255) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function emailDomain(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1).toLowerCase();
}

function hostOrSuffixBlocked(domain: string, blocked: Set<string>): boolean {
  if (blocked.has(domain)) return true;
  let dot = domain.indexOf('.');
  while (dot !== -1) {
    const parent = domain.slice(dot + 1);
    if (blocked.has(parent)) return true;
    dot = domain.indexOf('.', dot + 1);
  }
  return false;
}

export function isDemoWorkEmail(value: string): boolean {
  if (!isDemoEmailShape(value)) return false;
  const domain = emailDomain(value);
  if (!domain) return false;

  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (RESERVED_EMAIL_TLDS.has(tld)) return false;
  if (hostOrSuffixBlocked(domain, RESERVED_EMAIL_DOMAINS)) return false;
  if (hostOrSuffixBlocked(domain, FREE_EMAIL_DOMAINS)) return false;
  if (hostOrSuffixBlocked(domain, DISPOSABLE_EMAIL_DOMAINS)) return false;
  return true;
}
