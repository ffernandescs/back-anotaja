import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { CashRegisterNotOpenException } from '../exceptions/cash-register.exception';

@Catch(CashRegisterNotOpenException)
export class CashRegisterFilter implements ExceptionFilter {
  catch(exception: CashRegisterNotOpenException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    response.status(status).json({
      statusCode: status,
      message: exceptionResponse.message,
      error: exceptionResponse.error,
      code: exceptionResponse.code,
      timestamp: new Date().toISOString(),
    });
  }
}
