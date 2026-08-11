import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthPrincipal } from '../auth.types';

@Injectable()
export class UserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const user = request.user;
    if (!user || user.typ !== 'user') {
      throw new ForbiddenException('Organization user access required');
    }
    return true;
  }
}
