import {
  DEMO_PERSON_NAME_MESSAGE,
  isDemoPersonName,
} from '@call-agent/contracts';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';

@ValidatorConstraint({ name: 'isDemoPersonName', async: false })
export class IsDemoPersonNameConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isDemoPersonName(value);
  }

  defaultMessage(): string {
    return DEMO_PERSON_NAME_MESSAGE;
  }
}

export function IsDemoPersonName() {
  return Validate(IsDemoPersonNameConstraint);
}
