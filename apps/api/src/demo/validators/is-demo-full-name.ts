import {
  DEMO_PERSON_NAME_MESSAGE,
  isDemoFullName,
  isDemoPersonName,
} from '@call-agent/contracts';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';

/**
 * Rejects known fake first+last pairs (John Doe) after each name already
 * passed {@link IsDemoPersonName}.
 */
@ValidatorConstraint({ name: 'isDemoFullName', async: false })
export class IsDemoFullNameConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    const firstName = (args.object as { firstName?: unknown }).firstName;
    if (typeof firstName !== 'string') return false;
    // Per-field quality is owned by @IsDemoPersonName; only flag known fake pairs here.
    if (!isDemoPersonName(firstName) || !isDemoPersonName(value)) return true;
    return isDemoFullName(firstName, value);
  }

  defaultMessage(): string {
    return DEMO_PERSON_NAME_MESSAGE;
  }
}

export function IsDemoFullName() {
  return Validate(IsDemoFullNameConstraint);
}
