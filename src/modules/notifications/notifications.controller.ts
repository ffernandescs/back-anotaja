import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MarkNotificationReadDto, NotificationEntityType } from './dto/mark-notification-read.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Marca uma notificação como lida
   * POST /notifications/read
   */
  @Post('read')
  async markAsRead(@Req() req: RequestWithUser, @Body() dto: MarkNotificationReadDto) {
    return this.notificationsService.markAsRead(req.user.userId, dto);
  }

  /**
   * Marca múltiplas notificações como lidas
   * POST /notifications/read/multiple
   */
  @Post('read/multiple')
  async markMultipleAsRead(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      notifications: Array<{ entityType: NotificationEntityType; entityId: string }>;
    },
  ) {
    return this.notificationsService.markMultipleAsRead(req.user.userId, body.notifications);
  }

  /**
   * Verifica se uma notificação foi lida
   * GET /notifications/read/check?entityType=ORDER&entityId=xxx
   */
  @Get('read/check')
  async isRead(
    @Req() req: RequestWithUser,
    @Query('entityType') entityType: NotificationEntityType,
    @Query('entityId') entityId: string,
  ) {
    return this.notificationsService.isRead(req.user.userId, entityType, entityId);
  }

  /**
   * Obtém todas as notificações lidas do usuário
   * GET /notifications/read?entityType=ORDER (opcional)
   */
  @Get('read')
  async getReadNotifications(
    @Req() req: RequestWithUser,
    @Query('entityType') entityType?: NotificationEntityType,
  ) {
    return this.notificationsService.getReadNotifications(req.user.userId, entityType);
  }
}

