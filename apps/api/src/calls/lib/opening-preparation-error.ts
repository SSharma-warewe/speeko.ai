import { ServiceUnavailableException } from '@nestjs/common';

export class OpeningPreparationError extends ServiceUnavailableException {
  constructor() {
    super('Opening audio could not be prepared; call was not placed');
  }
}
