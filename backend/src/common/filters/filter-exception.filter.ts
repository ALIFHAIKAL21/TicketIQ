import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class FilterExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FilterExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();

      let message: string | string[] = exception.message;
      let error = exception.name;

      if (typeof payload === 'string') {
        message = payload;
      } else if (typeof payload === 'object' && payload !== null) {
        if ('message' in payload) {
          const payloadMessage = payload.message;
          if (typeof payloadMessage === 'string' || Array.isArray(payloadMessage)) {
            message = payloadMessage as string | string[];
          }
        }

        if ('error' in payload && typeof payload.error === 'string') {
          error = payload.error;
        }
      }

      response.status(statusCode).json({
        statusCode,
        message: Array.isArray(message) ? message.join(', ') : message,
        error,
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }
}