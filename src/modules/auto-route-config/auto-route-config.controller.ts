import {
  Controller,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
  Post,
  Param,
  Put,
} from '@nestjs/common';
import { AutoRouteConfigService } from './auto-route-config.service';
import { UpdateAutoRouteConfigDto } from './dto/update-auto-route-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('auto-route-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutoRouteConfigController {
  constructor(
    private readonly autoRouteConfigService: AutoRouteConfigService,
  ) {}

  // GET /api/auto-route-config/:branchId
  // O branchId no parâmetro é ignorado, sempre usa o user.branchId
  @Get()
  findOne(@Req() req: RequestWithUser, @Param('branchId') branchId: string) {
    // O branchId do parâmetro é ignorado por segurança
    // Sempre usa o branchId do usuário autenticado
    return this.autoRouteConfigService.findOne(req.user.userId);
  }

  @Put()
  updatePut(
    @Req() req: RequestWithUser,
    @Body() updateDto: UpdateAutoRouteConfigDto,
  ) {
    // O branchId do parâmetro é ignorado por segurança
    return this.autoRouteConfigService.update(req.user.userId, updateDto);
  }

  // PATCH /api/auto-route-config/:branchId
  @Patch()
  update(
    @Req() req: RequestWithUser,
    @Body() updateDto: UpdateAutoRouteConfigDto,
  ) {
    // O branchId do parâmetro é ignorado por segurança
    return this.autoRouteConfigService.update(req.user.userId, updateDto);
  }

  // POST /api/auto-route-config/:branchId/reset
  @Post('/reset')
  reset(@Req() req: RequestWithUser, @Param('branchId') branchId: string) {
    // O branchId do parâmetro é ignorado por segurança
    return this.autoRouteConfigService.reset(req.user.userId);
  }
}
