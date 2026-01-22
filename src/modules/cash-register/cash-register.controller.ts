import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Put,
} from '@nestjs/common';
import { CashRegisterService } from './cash-register.service';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('cash-register')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  @Post()
  create(
    @Body() createCashRegisterDto: CreateCashRegisterDto,
    @Req() req: RequestWithUser,
  ) {
    return this.cashRegisterService.create(
      createCashRegisterDto,
      req.user.userId,
    );
  }

  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.cashRegisterService.findAll(req.user.userId);
  }

  // NOVO: Endpoint para calcular saldo esperado em tempo real
  @Get('expected-balance')
  calculateExpectedBalance(@Req() req: RequestWithUser) {
    return this.cashRegisterService.calculateExpectedBalance(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.cashRegisterService.findOne(id, req.user.userId);
  }

  @Put(':id')
  closedCashRegister(
    @Param('id') id: string,
    @Body() createCashRegisterDto: { closingAmount: number; notes: string },
    @Req() req: RequestWithUser,
  ) {
    return this.cashRegisterService.closedCashRegister(
      id,
      {
        closingAmount: createCashRegisterDto.closingAmount,
        notes: createCashRegisterDto.notes,
      },
      req.user.userId,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCashRegisterDto: UpdateCashRegisterDto,
  ) {
    return this.cashRegisterService.update(+id, updateCashRegisterDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cashRegisterService.remove(+id);
  }
}
