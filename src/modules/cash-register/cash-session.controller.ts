import { 
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
  Req,
  Query
} from '@nestjs/common';
import { CashSessionService } from './cash-session.service';
import { CreateCashSessionDto } from './dto/create-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateCashMovementDto } from './dto/cash-movement.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// import { PermissionsGuard } from '../auth/guards/permissions.guard';
// import { RequirePermissions } from '../auth/decorators/permissions.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
    scope?: string;
  };
}

@Controller('cash-session')
@UseGuards(JwtAuthGuard) // , PermissionsGuard
export class CashSessionController {
  constructor(private readonly cashSessionService: CashSessionService) {}

  @Post('open')
  async openCashSession(@Body() createCashSessionDto: CreateCashSessionDto, @Req() req: RequestWithUser) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.cashSessionService.openCashSession(createCashSessionDto, req.user.userId);
  }

  @Get()
  async findAllCashSessions(
    @Req() req: RequestWithUser,
    @Query('includeAll') includeAll?: string,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    const includeAllBool = includeAll === 'true';
    return this.cashSessionService.findAllCashSessions(req.user.userId, includeAllBool);
  }

  @Get('for-transfer')
  async findAllForTransfer(@Req() req: RequestWithUser) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    // Sempre retorna todos os caixas abertos para transferência
    return this.cashSessionService.findAllCashSessions(req.user.userId, true);
  }

  @Get('balance')
  async getExpectedBalance(@Req() req: RequestWithUser) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.cashSessionService.calculateExpectedBalance(req.user.userId);
  }

  @Get('last-closed')
  async findLastClosed(@Req() req: RequestWithUser) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.cashSessionService.findLastClosedByBranch(req.user.userId);
  }

  @Get(':id')
  async findCashSessionById(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.cashSessionService.findCashSessionById(id, req.user.userId);
  }

  @Post(':id/close')
  async closeCashSession(
    @Param('id') id: string,
    @Body() closeCashDto: CloseCashSessionDto,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.cashSessionService.closeCashSession(id, closeCashDto, req.user.userId);
  }

  @Post('movement')
  async addCashMovement(
    @Body() payload: CreateCashMovementDto,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.cashSessionService.addCashMovement(req.user.userId, payload);
  }

  @Post('transfer/:targetSessionId')
  async transferBetweenSessions(
    @Param('targetSessionId') targetSessionId: string,
    @Body() payload: CreateCashMovementDto,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    if (payload.type !== 'TRANSFER') {
      throw new BadRequestException('Tipo de movimento deve ser TRANSFER para transferências');
    }
    return this.cashSessionService.addCashMovement(req.user.userId, payload, targetSessionId);
  }

  @Post('deposit')
  async addDeposit(
    @Body() payload: { amount: number; description?: string },
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    const movementDto: CreateCashMovementDto = {
      type: 'DEPOSIT',
      amount: payload.amount,
      description: payload.description,
    };
    return this.cashSessionService.addCashMovement(req.user.userId, movementDto);
  }

  @Post('withdrawal')
  async addWithdrawal(
    @Body() payload: { amount: number; description?: string },
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    if (!payload.description) {
      throw new BadRequestException('Sangria exige descrição/motivo');
    }
    
    const movementDto: CreateCashMovementDto = {
      type: 'WITHDRAWAL',
      amount: payload.amount,
      description: payload.description,
    };
    return this.cashSessionService.addCashMovement(req.user.userId, movementDto);
  }
}
