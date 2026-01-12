import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MarkNotificationReadDto,
  NotificationEntityType,
} from './dto/mark-notification-read.dto';
import { prisma } from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';

@Injectable()
export class NotificationsService {
  /**
   * Marca uma notificação como lida para um usuário
   * Suporta diferentes tipos de entidades (ORDER, SYSTEM, ANNOUNCEMENT, etc.)
   */
  async markAsRead(userId: string, dto: MarkNotificationReadDto) {
    // Verificar se a entidade existe (validação opcional, mas recomendada)
    await this.validateEntity(dto.entityType, dto.entityId);

    // Criar ou atualizar o registro de notificação lida
    // Usa upsert para garantir que não duplique se já existir
    const notificationRead = await prisma.notificationRead.upsert({
      where: {
        userId_entityType_entityId: {
          userId,
          entityType: dto.entityType,
          entityId: dto.entityId,
        },
      },
      update: {
        readAt: new Date(),
        metadata: dto.metadata || null,
      },
      create: {
        userId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        metadata: dto.metadata || null,
        readAt: new Date(),
      },
    });

    return {
      success: true,
      notificationRead,
    };
  }

  /**
   * Marca múltiplas notificações como lidas (útil para "marcar todas como lidas")
   */
  async markMultipleAsRead(
    userId: string,
    notifications: Array<{
      entityType: NotificationEntityType;
      entityId: string;
    }>,
  ) {
    const results = await Promise.all(
      notifications.map((notification) =>
        this.markAsRead(userId, {
          entityType: notification.entityType,
          entityId: notification.entityId,
        }),
      ),
    );

    return {
      success: true,
      count: results.length,
      results,
    };
  }

  /**
   * Verifica se uma notificação foi lida
   */
  async isRead(
    userId: string,
    entityType: NotificationEntityType,
    entityId: string,
  ) {
    const notificationRead = await prisma.notificationRead.findUnique({
      where: {
        userId_entityType_entityId: {
          userId,
          entityType,
          entityId,
        },
      },
    });

    return {
      isRead: !!notificationRead,
      readAt: notificationRead?.readAt || null,
    };
  }

  /**
   * Obtém todas as notificações lidas de um usuário (opcional: filtrar por tipo)
   */
  async getReadNotifications(
    userId: string,
    entityType?: NotificationEntityType,
  ) {
    // Tipando corretamente o filtro
    const where: Prisma.NotificationReadWhereInput = { userId };

    if (entityType) {
      where.entityType = entityType;
    }

    return prisma.notificationRead.findMany({
      where,
      orderBy: {
        readAt: 'desc',
      },
      take: 100, // Limitar a 100 registros
    });
  }
  /**
   * Valida se a entidade existe no banco (validação opcional)
   */
  private async validateEntity(
    entityType: NotificationEntityType,
    entityId: string,
  ) {
    switch (entityType) {
      case NotificationEntityType.ORDER: {
        const order = await prisma.order.findUnique({
          where: { id: entityId },
          select: { id: true },
        });
        if (!order) {
          throw new NotFoundException(
            `Pedido com ID ${entityId} não encontrado`,
          );
        }
        break;
      }

      case NotificationEntityType.ANNOUNCEMENT: {
        const announcement = await prisma.announcement.findUnique({
          where: { id: entityId },
          select: { id: true },
        });
        if (!announcement) {
          throw new NotFoundException(
            `Aviso com ID ${entityId} não encontrado`,
          );
        }
        break;
      }

      case NotificationEntityType.SYSTEM:
        // Notificações de sistema podem não ter entidade no banco, então não validamos
        break;

      default:
        // Para tipos desconhecidos, não validamos (permite extensibilidade)
        break;
    }
  }
}
