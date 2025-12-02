import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../domain/exceptions/domain.exception';

/**
 * Global exception filter that converts DomainExceptions to proper HTTP responses.
 *
 * DomainExceptions represent business rule violations and should return 400 Bad Request
 * with the domain error message.
 *
 * Examples:
 * - "Agent must be running to terminate" → 400 Bad Request
 * - "Prompt cannot be empty" → 400 Bad Request
 * - "Invalid agent status transition" → 400 Bad Request
 */
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: exception.message,
      error: 'Bad Request',
    });
  }
}
