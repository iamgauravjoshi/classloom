import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { requestId?: string }>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const detail = typeof raw === 'object' && raw && 'message' in raw ? raw.message : null;
    const message = status >= 500
      ? 'Something went wrong. Please try again later.'
      : typeof detail === 'string'
        ? detail
        : exception instanceof Error
          ? exception.message
          : 'Request failed';
    const code = status === 404 ? 'NOT_FOUND' : status === 400 ? 'BAD_REQUEST' : status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`;

    const details = status < 500 && typeof raw === 'object' && raw && 'details' in raw &&
      typeof raw.details === 'object' && raw.details ? raw.details : {};
    response.status(status).json({ code, message, details, requestId: request.requestId ?? null });
  }
}
