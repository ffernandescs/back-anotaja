import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminAlertsService } from './admin-alerts.service';

interface RequestWithUser {
  user: {
    userId: string;
  };
}

@Controller('admin-alerts')
@UseGuards(JwtAuthGuard)
export class AdminAlertsController {
  constructor(private readonly adminAlertsService: AdminAlertsService) {}

  /**
   * Lista alertas ativos da filial do usuário (computados em tempo real).
   */
  @Get()
  async list(@Req() req: RequestWithUser) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    return this.adminAlertsService.getAlertsForUser(req.user.userId);
  }
}
