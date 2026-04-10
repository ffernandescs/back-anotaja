import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from 'lib/prisma';

@Injectable()
export class PerformanceService {
  constructor() {}

  async getCustomerReport(userId: string, startDate: Date, endDate: Date) {

    const user = await prisma.user.findUnique({
      where: {id:userId}
    })

    if (!user?.branchId) throw new NotFoundException('Filial não encontrado');
    // Buscar todos os pedidos no período
    const orders = await prisma.order.findMany({
      where: {
        branchId: user?.branchId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        customer: true,
      },
    });

    // Buscar clientes cadastrados no período
    const newCustomers = await prisma.customer.count({  
      where: {
        branchId:user.branchId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Buscar todos os clientes da filial com TODOS os pedidos (para análise de recorrência correta)
    const allCustomers = await prisma.customer.findMany({
      where: {
        branchId:user.branchId,
      },
      include: {
        orders: {
          where: {
            branchId: user.branchId,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    // Buscar clientes com pedidos no período (para métricas)
    const customersWithOrdersInPeriod = allCustomers.filter(c =>
      c.orders.some(o => new Date(o.createdAt) >= startDate && new Date(o.createdAt) <= endDate)
    );

    // Buscar visitantes do catálogo web
    const totalVisitors = await prisma.pageView.count({
      where: {
        branchId: user.branchId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // 1. Taxa de conversão: % visitantes que fizeram pedido
    const conversionRate = totalVisitors > 0
      ? (orders.length / totalVisitors) * 100
      : 0;

    // 2. Taxa de Recorrência: quantidade média de pedidos por cliente no período
    const customersWithOrdersInPeriodFiltered = customersWithOrdersInPeriod.filter(c =>
      c.orders.some(o => new Date(o.createdAt) >= startDate && new Date(o.createdAt) <= endDate)
    );
    const recurrenceRate = customersWithOrdersInPeriodFiltered.length > 0
      ? orders.length / customersWithOrdersInPeriodFiltered.length
      : 0;

    // 3. Taxa de Fidelidade: % clientes que pediram mais de uma vez no período
    const loyalCustomers = customersWithOrdersInPeriodFiltered.filter(c => {
      const ordersInPeriod = c.orders.filter(o =>
        new Date(o.createdAt) >= startDate && new Date(o.createdAt) <= endDate
      );
      return ordersInPeriod.length > 1;
    });
    const loyaltyRate = customersWithOrdersInPeriodFiltered.length > 0
      ? (loyalCustomers.length / customersWithOrdersInPeriodFiltered.length) * 100
      : 0;

    // 4. Novos Clientes
    const newCustomersCount = newCustomers;

    // Análise de Recorrência (última compra) - baseada na endDate do filtro
    const thirtyDaysAgo = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(endDate.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneEightyDaysAgo = new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000);

    const neverPurchased = allCustomers.filter(c => c.orders.length === 0).length;
    const last30Days = allCustomers.filter(c => {
      const lastOrder = c.orders[c.orders.length - 1];
      return lastOrder && new Date(lastOrder.createdAt) >= thirtyDaysAgo;
    }).length;
    const last30to60Days = allCustomers.filter(c => {
      const lastOrder = c.orders[c.orders.length - 1];
      return lastOrder &&
        new Date(lastOrder.createdAt) >= sixtyDaysAgo &&
        new Date(lastOrder.createdAt) < thirtyDaysAgo;
    }).length;
    const last60to90Days = allCustomers.filter(c => {
      const lastOrder = c.orders[c.orders.length - 1];
      return lastOrder &&
        new Date(lastOrder.createdAt) >= ninetyDaysAgo &&
        new Date(lastOrder.createdAt) < sixtyDaysAgo;
    }).length;
    const last90to180Days = allCustomers.filter(c => {
      const lastOrder = c.orders[c.orders.length - 1];
      return lastOrder &&
        new Date(lastOrder.createdAt) >= oneEightyDaysAgo &&
        new Date(lastOrder.createdAt) < ninetyDaysAgo;
    }).length;
    const moreThan180Days = allCustomers.filter(c => {
      const lastOrder = c.orders[c.orders.length - 1];
      return lastOrder && new Date(lastOrder.createdAt) < oneEightyDaysAgo;
    }).length;

    const recurrenceAnalysis = [
      { group: 'Nunca compraram', count: neverPurchased },
      { group: 'Última compra nos últimos 30 dias', count: last30Days },
      { group: 'Última compra nos últimos 30 a 60 dias', count: last30to60Days },
      { group: 'Última compra nos últimos 60 a 90 dias', count: last60to90Days },
      { group: 'Última compra nos últimos 90 a 180 dias', count: last90to180Days },
      { group: 'Última compra há mais de 180 dias', count: moreThan180Days },
    ];

    // Análise por tipo de cliente
    const ordersWithNewCustomers = orders.filter(o => {
      return o.customer && new Date(o.customer.createdAt) >= startDate;
    });
    
    const ordersWithRecurringCustomers = orders.filter(o => {
      return o.customer && new Date(o.customer.createdAt) < startDate;
    });

    const ordersWithoutCustomer = orders.filter(o => !o.customer);

    const newCustomersRevenue = ordersWithNewCustomers.reduce((sum, o) => sum + (o.total || 0), 0);
    const recurringCustomersRevenue = ordersWithRecurringCustomers.reduce((sum, o) => sum + (o.total || 0), 0);
    const noCustomerRevenue = ordersWithoutCustomer.reduce((sum, o) => sum + (o.total || 0), 0);

    const customerTypeAnalysis = [
      {
        type: 'Pedidos de novos clientes',
        revenue: newCustomersRevenue,
        orders: ordersWithNewCustomers.length,
        averageTicket: ordersWithNewCustomers.length > 0 ? newCustomersRevenue / ordersWithNewCustomers.length : 0,
      },
      {
        type: 'Pedidos de clientes Recorrentes',
        revenue: recurringCustomersRevenue,
        orders: ordersWithRecurringCustomers.length,
        averageTicket: ordersWithRecurringCustomers.length > 0 ? recurringCustomersRevenue / ordersWithRecurringCustomers.length : 0,
      },
      {
        type: 'Pedidos sem clientes identificados',
        revenue: noCustomerRevenue,
        orders: ordersWithoutCustomer.length,
        averageTicket: ordersWithoutCustomer.length > 0 ? noCustomerRevenue / ordersWithoutCustomer.length : 0,
      },
    ];

    return {
      metrics: {
        conversionRate: Number(conversionRate.toFixed(2)),
        recurrenceRate: Number(recurrenceRate.toFixed(2)),
        loyaltyRate: Number(loyaltyRate.toFixed(2)),
        newCustomers: newCustomersCount,
      },
      recurrenceAnalysis,
      customerTypeAnalysis,
    };
  }

  async getCustomersWithOrdersInPeriod(userId: string, startDate: Date, endDate: Date, search?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.branchId) throw new NotFoundException('Filial não encontrado');

    // Buscar clientes que fizeram pedidos no período
    const customers = await prisma.customer.findMany({
      where: {
        branchId: user.branchId,
        orders: {
          some: {
            branchId: user.branchId,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      },
      include: {
        orders: {
          where: {
            branchId: user.branchId,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    });

    // Calcular métricas para cada cliente
    const customersWithMetrics = customers.map((customer) => {
      const ordersInPeriod = customer.orders;
      const totalRevenue = ordersInPeriod.reduce((sum, order) => sum + (order.total || 0), 0);
      const totalOrders = ordersInPeriod.length;
      const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Calcular tempo de cliente
      const customerSince = new Date(customer.createdAt);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - customerSince.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let customerSinceText = '';
      if (diffDays < 30) {
        customerSinceText = `${diffDays} dias`;
      } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        customerSinceText = `${months} ${months === 1 ? 'mês' : 'meses'}`;
      } else {
        const years = Math.floor(diffDays / 365);
        customerSinceText = `${years} ${years === 1 ? 'ano' : 'anos'}`;
      }

      return {
        id: customer.id,
        name: customer.name || 'Sem nome',
        email: customer.email,
        phone: customer.phone,
        customerSince: customer.createdAt,
        customerSinceText: `${new Date(customer.createdAt).toLocaleDateString('pt-BR')} (${customerSinceText})`,
        revenue: totalRevenue,
        totalOrders,
        averageTicket,
      };
    });

    // Ordenar por faturamento (maior para menor)
    customersWithMetrics.sort((a, b) => b.revenue - a.revenue);

    return customersWithMetrics;
  }

  async getSalesReport(userId: string, startDate: Date, endDate: Date) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.branchId) throw new NotFoundException('Filial não encontrada');

    // Calcular período anterior usando mês anterior para alinhar por dia do mês
    const previousStartDate = new Date(startDate);
    previousStartDate.setMonth(previousStartDate.getMonth() - 1);
    // Ajustar para o último dia do mês anterior
    const previousEndDate = new Date(endDate);
    previousEndDate.setMonth(previousEndDate.getMonth() - 1);
    // Se o dia atual não existe no mês anterior (ex: 31/03 -> 28/02), ajusta para o último dia do mês
    const lastDayOfPreviousMonth = new Date(previousEndDate.getFullYear(), previousEndDate.getMonth() + 1, 0).getDate();
    previousEndDate.setDate(Math.min(previousEndDate.getDate(), lastDayOfPreviousMonth));

    // Buscar pedidos do período atual
    const currentOrders = await prisma.order.findMany({
      where: {
        branchId: user.branchId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          notIn: ['CANCELLED'],
        },
      },
      select: {
        id: true,
        total: true,
        createdAt: true,
      },
    });

    // Buscar pedidos do período anterior
    const previousOrders = await prisma.order.findMany({
      where: {
        branchId: user.branchId,
        createdAt: {
          gte: previousStartDate,
          lte: previousEndDate,
        },
        status: {
          notIn: ['CANCELLED'],
        },
      },
      select: {
        id: true,
        total: true,
        createdAt: true,
      },
    });

    // Métricas do período atual
    const currentRevenue = currentOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const currentOrdersCount = currentOrders.length;
    const currentAvgTicket = currentOrdersCount > 0 ? currentRevenue / currentOrdersCount : 0;

    // Métricas do período anterior
    const previousRevenue = previousOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const previousOrdersCount = previousOrders.length;
    const previousAvgTicket = previousOrdersCount > 0 ? previousRevenue / previousOrdersCount : 0;

    // Calcular percentuais de crescimento
    const revenueGrowth = previousRevenue > 0
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
      : currentRevenue > 0 ? 100 : 0;

    const ordersGrowth = previousOrdersCount > 0
      ? ((currentOrdersCount - previousOrdersCount) / previousOrdersCount) * 100
      : currentOrdersCount > 0 ? 100 : 0;

    const avgTicketGrowth = previousAvgTicket > 0
      ? ((currentAvgTicket - previousAvgTicket) / previousAvgTicket) * 100
      : currentAvgTicket > 0 ? 100 : 0;

    // Agrupar por dia para o gráfico - período atual
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const groupByDay = (orders: typeof currentOrders, start: Date, end: Date) => {
      const grouped: Record<string, { revenue: number; orders: number }> = {};
      const current = new Date(start);
      while (current <= end) {
        const key = `${String(current.getDate()).padStart(2, '0')} ${monthNames[current.getMonth()]}`;
        grouped[key] = { revenue: 0, orders: 0 };
        current.setDate(current.getDate() + 1);
      }

      for (const order of orders) {
        const d = new Date(order.createdAt);
        const key = `${String(d.getDate()).padStart(2, '0')} ${monthNames[d.getMonth()]}`;
        if (grouped[key]) {
          grouped[key].revenue += order.total || 0;
          grouped[key].orders += 1;
        }
      }

      return Object.entries(grouped).map(([period, data]) => ({
        period,
        revenue: data.revenue,
        orders: data.orders,
        avgTicket: data.orders > 0 ? Math.round(data.revenue / data.orders) : 0,
      }));
    };

    const groupByHour = (orders: typeof currentOrders) => {
      const grouped: Record<string, { revenue: number; orders: number }> = {};
      for (let i = 0; i < 24; i++) {
        const key = `${String(i).padStart(2, '0')}h`;
        grouped[key] = { revenue: 0, orders: 0 };
      }

      for (const order of orders) {
        const d = new Date(order.createdAt);
        const key = `${String(d.getHours()).padStart(2, '0')}h`;
        if (grouped[key]) {
          grouped[key].revenue += order.total || 0;
          grouped[key].orders += 1;
        }
      }

      return Object.entries(grouped).map(([period, data]) => ({
        period,
        revenue: data.revenue,
        orders: data.orders,
        avgTicket: data.orders > 0 ? Math.round(data.revenue / data.orders) : 0,
      }));
    };

    const currentByDay = groupByDay(currentOrders, startDate, endDate);
    const previousByDay = groupByDay(previousOrders, previousStartDate, previousEndDate);
    const currentByHour = groupByHour(currentOrders);
    const previousByHour = groupByHour(previousOrders);

    return {
      summary: {
        revenue: {
          current: currentRevenue,
          previous: previousRevenue,
          growth: Number(revenueGrowth.toFixed(1)),
        },
        orders: {
          current: currentOrdersCount,
          previous: previousOrdersCount,
          growth: Number(ordersGrowth.toFixed(1)),
        },
        avgTicket: {
          current: currentAvgTicket,
          previous: previousAvgTicket,
          growth: Number(avgTicketGrowth.toFixed(1)),
        },
      },
      chart: {
        daily: {
          current: currentByDay,
          previous: previousByDay,
        },
        hourly: {
          current: currentByHour,
          previous: previousByHour,
        },
      },
      periodLabels: {
        current: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
        previous: `${previousStartDate.toLocaleDateString('pt-BR')} a ${previousEndDate.toLocaleDateString('pt-BR')}`,
      },
    };
  }
}
