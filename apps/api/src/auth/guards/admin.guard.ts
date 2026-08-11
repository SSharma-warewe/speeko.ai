import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthPrincipal } from '../auth.types';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const user = request.user;
    if (!user || user.typ !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
