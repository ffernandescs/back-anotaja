import { Injectable } from '@nestjs/common';
import { prisma } from 'lib/prisma';

@Injectable()
export class PageViewsService {
  async trackPageView(
    data: { page: string; url?: string; visitorId?: string; userAgent?: string; referer?: string },
    subdomain?: string,
  ) {
    // Buscar branch pelo subdomain
    const branch = await prisma.branch.findFirst({
      where: subdomain ? { subdomain } : { active: true },
    });

    if (!branch) {
      throw new Error('Branch not found');
    }

    return prisma.pageView.create({
      data: {
        branchId: branch.id,
        page: data.page,
        url: data.url,
        visitorId: data.visitorId,
        userAgent: data.userAgent,
        referer: data.referer,
      },
    });
  }

  async getPageViews(
    userId?: string,
    subdomain?: string,
    startDate?: Date,
    endDate?: Date,
    groupBy: 'hour' | 'day' = 'day',
  ) {
    let branchId: string;

    // Se userId foi fornecido (admin), buscar branchId do usuário
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { branchId: true },
      });

      if (!user?.branchId) {
        throw new Error('User not found or has no branch');
      }

      branchId = user.branchId;
    } else {
      // Se subdomain foi fornecido (loja), buscar branch pelo subdomain
      const branch = await prisma.branch.findFirst({
        where: subdomain ? { subdomain } : { active: true },
      });

      if (!branch) {
        throw new Error('Branch not found');
      }

      branchId = branch.id;
    }

    const where: any = {
      branchId,
    };

    if (startDate && endDate) {
      where.createdAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    const pageViews = await prisma.pageView.findMany({
      where,
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Agrupar por período
    const grouped = this.groupByPeriod(pageViews, groupBy, startDate, endDate);

    return {
      total: pageViews.length,
      uniqueVisitors: new Set(pageViews.map((pv) => pv.visitorId)).size,
      grouped,
    };
  }

  private groupByPeriod(pageViews: any[], groupBy: string, startDate?: Date, endDate?: Date) {
    const grouped: Record<string, number> = {};
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    // Agrupar visitas por período
    pageViews.forEach((pv) => {
      const date = new Date(pv.createdAt);
      let key: string;

      switch (groupBy) {
        case 'hour':
          key = `${String(date.getHours()).padStart(2, '0')}h`;
          break;
        case 'day':
          key = `${String(date.getDate()).padStart(2, '0')}${monthNames[date.getMonth()]}`;
          break;
        default:
          key = date.toISOString().split('T')[0];
      }

      grouped[key] = (grouped[key] || 0) + 1;
    });

    return Object.entries(grouped).map(([period, count]) => ({
      period,
      count: count as number,
    }));
  }
}
