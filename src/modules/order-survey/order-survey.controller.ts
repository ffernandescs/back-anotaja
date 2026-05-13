import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { OrderSurveyService } from './order-survey.service';
import { CreateOrderSurveyDto } from './dto/create-order-survey.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from 'src/common/decorators/public.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
    branchId: string;
  };
}

// ─── Rotas públicas (cardápio do cliente) ─────────────────────────────────────
@Controller('store/order-survey')
export class OrderSurveyPublicController {
  constructor(private readonly orderSurveyService: OrderSurveyService) {}

  // GET /store/order-survey/:token → valida token e retorna dados para a página
  @Public()
  @Get(':token')
  validateToken(@Param('token') token: string) {
    return this.orderSurveyService.validateToken(token);
  }

  // POST /store/order-survey/:token → submete a resposta
  @Public()
  @Post(':token')
  submitResponse(
    @Param('token') token: string,
    @Body() dto: CreateOrderSurveyDto,
  ) {
    return this.orderSurveyService.submitResponse(token, dto);
  }
}

// ─── Rotas autenticadas (painel admin) ────────────────────────────────────────
@Controller('order-survey')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderSurveyController {
  constructor(private readonly orderSurveyService: OrderSurveyService) {}

  // GET /order-survey/order/:orderId → retorna token do pedido (tela de acompanhamento)
  @Get('order/:orderId')
  getTokenByOrder(@Param('orderId') orderId: string) {
    return this.orderSurveyService.getTokenByOrder(orderId);
  }

  @Get('branch/dashboard')
  getDashboard(
    @Req() req: RequestWithUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.orderSurveyService.getDashboard(
      req.user.branchId,
      startDate,
      endDate,
    );
  }

  // GET /order-survey/branch/responses → lista respostas da filial do usuário logado
  @Get('branch/responses')
  findAllByBranch(@Req() req: RequestWithUser) {
    return this.orderSurveyService.findAllByBranch(req.user.userId);
  }

  // GET /order-survey/branch/averages → médias da filial (para dashboard)
  @Get('branch/averages')
  getAveragesByBranch(@Req() req: RequestWithUser) {
    return this.orderSurveyService.getAveragesByBranch(req.user.userId);
  }
}