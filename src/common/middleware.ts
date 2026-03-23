import {
  Injectable, NestMiddleware, NestInterceptor, ExecutionContext, CallHandler,
  Catch, ArgumentsHost, HttpException, HttpStatus, Logger,
  ExceptionFilter,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Observable, tap } from 'rxjs';
import * as crypto from 'crypto';

// ============================================================
// GLOBAL EXCEPTION FILTER (RFC 7807 Problem Details)
// ============================================================

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      title = HttpStatus[status] || 'Error';
      if (typeof body === 'string') detail = body;
      else if (typeof body === 'object' && body !== null) {
        detail = (body as any).message || title;
        if (Array.isArray(detail)) detail = (detail as string[]).join('. ');
      }
    }

    const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();

    if (status >= 500) {
      this.logger.error(`${status} ${req.method} ${req.url}: ${detail}`, exception instanceof Error ? exception.stack : '');
    }

    res.status(status).json({
      type: `https://agentops.eu/errors/${status}`,
      title,
      status,
      detail,
      instance: req.url,
      timestamp: new Date().toISOString(),
      correlationId,
    });
  }
}

// ============================================================
// CORRELATION ID MIDDLEWARE
// ============================================================

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
    req.headers['x-correlation-id'] = id;
    res.setHeader('X-Correlation-Id', id);
    next();
  }
}

// ============================================================
// SECURITY HEADERS MIDDLEWARE
// ============================================================

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.removeHeader('X-Powered-By');
    next();
  }
}

// ============================================================
// REQUEST LOGGING INTERCEPTOR
// ============================================================

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const start = Date.now();
    const correlationId = req.headers['x-correlation-id'] || '';

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          this.logger.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms [${correlationId}]`);
        },
        error: (error) => {
          const status = error instanceof HttpException ? error.getStatus() : 500;
          this.logger.warn(`${req.method} ${req.url} ${status} ${Date.now() - start}ms [${correlationId}] ${error.message}`);
        },
      }),
    );
  }
}

// ============================================================
// RESPONSE CACHE INTERCEPTOR
// ============================================================

@Injectable()
export class CacheHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(() => {
        const req = context.switchToHttp().getRequest<Request>();
        const res = context.switchToHttp().getResponse<Response>();
        if (req.method === 'GET' && !req.url.includes('/health')) {
          res.setHeader('Cache-Control', 'private, max-age=10');
        } else {
          res.setHeader('Cache-Control', 'no-store');
        }
      }),
    );
  }
}
