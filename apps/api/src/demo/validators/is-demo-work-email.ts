import {
  DEMO_WORK_EMAIL_MESSAGE,
  isDemoWorkEmail,
} from '@call-agent/contracts';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';

@ValidatorConstraint({ name: 'isDemoWorkEmail', async: false })
export class IsDemoWorkEmailConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isDemoWorkEmail(value);
  }

  defaultMessage(): string {
    return DEMO_WORK_EMAIL_MESSAGE;
  }
}

export function IsDemoWorkEmail() {
  return Validate(IsDemoWorkEmailConstraint);
}
