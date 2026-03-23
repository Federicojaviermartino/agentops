// === GUARDS ===
import * as crypto from 'crypto';
import {
  Injectable, CanActivate, ExecutionContext, SetMetadata,
  createParamDecorator, CallHandler, NestInterceptor, Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable, tap } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}

// === DECORATORS ===
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

// === INTERCEPTORS ===
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;

    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle().pipe(
        tap(() => {
          this.logger.log(
            `${method} ${req.url} by ${req.user?.email || 'anonymous'} [${req.user?.organizationId || 'no-org'}]`,
          );
        }),
      );
    }
    return next.handle();
  }
}

// === S02 FIX: Encryption service for sensitive fields (repoAccessToken, etc.) ===
@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private getKey(): Buffer {
    const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-key-32chars-min-padding!';
    return crypto.createHash('sha256').update(secret).digest();
  }
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), encrypted.toString('hex'), tag.toString('hex')].join(':');
  }
  decrypt(ciphertext: string): string {
    const [ivHex, encHex, tagHex] = ciphertext.split(':');
    if (!ivHex || !encHex || !tagHex) throw new Error('Invalid encrypted format');
    const decipher = crypto.createDecipheriv(this.algorithm, this.getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  }
}

// Plan enforcement guard
export { RequirePlan, PlanGuard } from './plan.guard';
