import { HttpException, HttpStatus } from '@nestjs/common';

export class CashRegisterNotOpenException extends HttpException {
  constructor(message: string = 'Nenhum caixa aberto encontrado') {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message: message,
        error: 'CashRegisterNotOpen',
        code: 'CASH_REGISTER_NOT_OPEN',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
