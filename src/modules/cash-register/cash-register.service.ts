import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';
import { prisma } from '../../../lib/prisma';
import { CashMovementType } from '@prisma/client';
import { PaymentMethodTypeDto } from '../branches/dto/create-branch.dto';
import { formatCurrency } from '../../utils/formatCurrency';
import { CashRegisterNotOpenException } from '../../common/exceptions/cash-register.exception';

@Injectable()
export class CashRegisterService {
  
}
