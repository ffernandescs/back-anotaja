import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { prisma } from '../../../lib/prisma';
import { permission } from 'process';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  @Get()
  async findAll(@Req() req: any) {
    const userId = req.user.userId;

    // Buscar o usuário para saber a empresa
    const userData = await prisma.user.findUnique({
      where: { id: userId ,},
      select: { companyId: true, branchId: true },
    });

    if (!userData?.branchId) {
      return [];
    }

    return prisma.group.findMany({
      where: {
        branchId: userData.branchId,
      },
      orderBy: {
        name: 'asc',
      },
    
      select: {
        id: true,
        name: true,
        description: true,
        users: true,
        permissions: true
      },
    });
  }
}
