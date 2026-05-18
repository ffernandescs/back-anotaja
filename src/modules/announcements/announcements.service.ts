import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { filterActiveAnnouncements } from './announcement-display.util';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  async findAll(branchId: string) {
    const announcements = await prisma.announcement.findMany({
      where: { branchId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return { announcements };
  }

  async findActiveForBranch(branchId: string) {
    const announcements = await prisma.announcement.findMany({
      where: { branchId, active: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return {
      announcements: filterActiveAnnouncements(announcements),
    };
  }

  async findOne(id: string, branchId?: string) {
    const announcement = await prisma.announcement.findFirst({
      where: {
        id,
        ...(branchId ? { branchId } : {}),
      },
    });
    if (!announcement) {
      throw new NotFoundException('Aviso não encontrado');
    }
    return announcement;
  }

  async create(dto: CreateAnnouncementDto, userBranchId?: string) {
    if (userBranchId && dto.branchId !== userBranchId) {
      throw new ForbiddenException('Sem permissão para esta filial');
    }

    return prisma.announcement.create({
      data: {
        title: dto.title.trim(),
        message: dto.message.trim(),
        imageUrl: dto.imageUrl?.trim() || null,
        type: dto.type,
        active: dto.active,
        displayPeriod: dto.displayPeriod ?? null,
        displayDays: dto.displayDays ?? null,
        displayOrder: dto.displayOrder ?? 0,
        branchId: dto.branchId,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateAnnouncementDto,
    userBranchId?: string,
  ) {
    const existing = await this.findOne(id, userBranchId);

    if (userBranchId && dto.branchId && dto.branchId !== userBranchId) {
      throw new ForbiddenException('Sem permissão para esta filial');
    }

    return prisma.announcement.update({
      where: { id: existing.id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.message !== undefined && { message: dto.message.trim() }),
        ...(dto.imageUrl !== undefined && {
          imageUrl: dto.imageUrl?.trim() || null,
        }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.displayPeriod !== undefined && {
          displayPeriod: dto.displayPeriod,
        }),
        ...(dto.displayDays !== undefined && { displayDays: dto.displayDays }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
      },
    });
  }

  async remove(id: string, userBranchId?: string) {
    await this.findOne(id, userBranchId);
    await prisma.announcement.delete({ where: { id } });
    return { success: true };
  }
}
