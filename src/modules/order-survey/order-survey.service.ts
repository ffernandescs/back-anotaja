import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { CreateOrderSurveyDto } from './dto/create-order-survey.dto';

const SURVEY_EXPIRY_DAYS = 7;

const generateSubdomainUrl = (subdomain: string): string => {
  const domain = (process.env.FRONTEND_URL || '').replace(
    /^https?:\/\//,
    '',
  );

  const protocol =
    process.env.NODE_ENV === 'development'
      ? 'http'
      : 'https';

  return domain
    ? `${protocol}://${subdomain}.${domain}`
    : `${protocol}://${subdomain}`;
};

@Injectable()
export class OrderSurveyService {
  // ─────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────

  async getDashboard(
    branchId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });

    if (!branch) {
      throw new UnprocessableEntityException(
        'Filial não encontrada',
      );
    }

    const where: any = {
      branchId,
    };

    if (startDate || endDate) {
      where.createdAt = {};

      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }

      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // ─────────────────────────────────────────────
    // TOTAL RESPOSTAS
    // ─────────────────────────────────────────────

    const totalResponses =
      await prisma.orderSurveyResponse.count({
        where,
      });

    // ─────────────────────────────────────────────
    // TOTAL TOKENS
    // ─────────────────────────────────────────────

    const tokenWhere: any = {
      branchId,
    };

    if (where.createdAt) {
      tokenWhere.createdAt = where.createdAt;
    }

    const totalTokensGenerated =
      await prisma.orderSurveyToken.count({
        where: tokenWhere,
      });

    // ─────────────────────────────────────────────
    // MÉDIAS
    // ─────────────────────────────────────────────

    const averagesAgg =
      await prisma.orderSurveyResponse.aggregate({
        where,
        _avg: {
          productQuality: true,
          deliveryTime: true,
          attendantRating: true,
          packagingRating: true,
        },
      });

    const averages = totalResponses
      ? {
          productQuality: Number(
            averagesAgg._avg.productQuality?.toFixed(
              2,
            ) ?? 0,
          ),

          deliveryTime: Number(
            averagesAgg._avg.deliveryTime?.toFixed(
              2,
            ) ?? 0,
          ),

          attendantRating: Number(
            averagesAgg._avg.attendantRating?.toFixed(
              2,
            ) ?? 0,
          ),

          packagingRating: Number(
            averagesAgg._avg.packagingRating?.toFixed(
              2,
            ) ?? 0,
          ),
        }
      : null;

    // ─────────────────────────────────────────────
    // RECOMENDARIAM
    // ─────────────────────────────────────────────

    const wouldRecommendCount =
      await prisma.orderSurveyResponse.count({
        where: {
          ...where,
          wouldRecommend: true,
        },
      });

    const wouldRecommendPct =
      totalResponses > 0
        ? Math.round(
            (wouldRecommendCount /
              totalResponses) *
              100,
          )
        : null;

    // ─────────────────────────────────────────────
    // RESPOSTAS + PEDIDOS
    // ─────────────────────────────────────────────

    const responses =
      await prisma.orderSurveyResponse.findMany({
        where,

        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              total: true,
              deliveryType: true,
              status: true,
              createdAt: true,
              deliveryAssignmentId: true,

              customer: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

    // ─────────────────────────────────────────────
    // MÉTRICAS DE PEDIDOS
    // ─────────────────────────────────────────────

    const totalRevenue = responses.reduce(
      (acc, r) => {
        return acc + Number(r.order?.total ?? 0);
      },
      0,
    );

    const averageTicket =
      responses.length > 0
        ? Number(
            (
              totalRevenue / responses.length
            ).toFixed(2),
          )
        : 0;

    const deliveredOrders = responses.filter(
      (r) =>
        r.order?.createdAt &&
        r.order?.deliveryAssignmentId,
    );

    const avgDeliveryMinutes =
      deliveredOrders.length > 0
        ? Math.round(
            deliveredOrders.reduce(
              (acc, r) => {
                const created = new Date(
                  r.order!.createdAt,
                ).getTime();

                const delivered = new Date(
                  r.order!.deliveryAssignmentId!,
                ).getTime();

                return (
                  acc +
                  (delivered - created) / 60000
                );
              },
              0,
            ) / deliveredOrders.length,
          )
        : null;

    // ─────────────────────────────────────────────
    // TIPOS DE ENTREGA
    // ─────────────────────────────────────────────

    const deliveryTypeMap = new Map<
      string,
      number
    >();

    for (const r of responses) {
      const type =
        r.order?.deliveryType ?? 'UNKNOWN';

      deliveryTypeMap.set(
        type,
        (deliveryTypeMap.get(type) ?? 0) + 1,
      );
    }

    const deliveryTypes = Array.from(
      deliveryTypeMap.entries(),
    ).map(([type, count]) => ({
      type,
      count,
    }));

    // ─────────────────────────────────────────────
    // CLIENTES RECORRENTES
    // ─────────────────────────────────────────────

    const customerMap = new Map<
      string,
      number
    >();

    for (const r of responses) {
      const customerId =
        r.order?.customer?.id;

      if (!customerId) continue;

      customerMap.set(
        customerId,
        (customerMap.get(customerId) ?? 0) +
          1,
      );
    }

    const recurringCustomers = Array.from(
      customerMap.values(),
    ).filter((count) => count > 1).length;

    // ─────────────────────────────────────────────
    // AVALIAÇÕES RUINS
    // ─────────────────────────────────────────────

    const lowRatings = responses.filter(
      (r) => {
        const avg =
          (
            r.productQuality +
            r.deliveryTime +
            r.attendantRating +
            r.packagingRating
          ) / 4;

        return avg <= 2.5;
      },
    ).length;

    // ─────────────────────────────────────────────
    // DISTRIBUIÇÃO DE NOTAS
    // ─────────────────────────────────────────────

    const ratingDistribution = [
      1, 2, 3, 4, 5,
    ].map((rating) => ({
      rating,
      count: 0,
    }));

    for (const r of responses) {
      const avg =
        (
          r.productQuality +
          r.deliveryTime +
          r.attendantRating +
          r.packagingRating
        ) / 4;

      const rounded = Math.round(avg);

      const item =
        ratingDistribution.find(
          (x) => x.rating === rounded,
        );

      if (item) {
        item.count += 1;
      }
    }

    // ─────────────────────────────────────────────
    // TIMESERIES
    // ─────────────────────────────────────────────

    const groupedMap = new Map<
      string,
      {
        total: number;
        count: number;
      }
    >();

    for (const r of responses) {
      const date = new Date(r.createdAt);

      const period =
        date.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        });

      const avg =
        (
          r.productQuality +
          r.deliveryTime +
          r.attendantRating +
          r.packagingRating
        ) / 4;

      const existing =
        groupedMap.get(period);

      if (existing) {
        existing.total += avg;
        existing.count += 1;
      } else {
        groupedMap.set(period, {
          total: avg,
          count: 1,
        });
      }
    }

    const timeSeries = Array.from(
      groupedMap.entries(),
    ).map(([period, value]) => ({
      period,
      avgRating: Number(
        (
          value.total / value.count
        ).toFixed(2),
      ),
      count: value.count,
    }));

    // ─────────────────────────────────────────────
    // RESPOSTAS RECENTES
    // ─────────────────────────────────────────────

    const recentResponses = responses
      .slice(0, 20)
      .map((r) => ({
        productQuality:
          r.productQuality,

        deliveryTime:
          r.deliveryTime,

        attendantRating:
          r.attendantRating,

        packagingRating:
          r.packagingRating,

        wouldRecommend:
          r.wouldRecommend,

        comment: r.comment,

        createdAt: r.createdAt,

        orderId: r.order?.id ?? null,

        orderNumber:
          r.order?.orderNumber ?? null,

        orderStatus:
          r.order?.status ?? null,

        orderTotal:
          Number(r.order?.total ?? 0),

        deliveryType:
          r.order?.deliveryType ??
          null,

        customerName:
          r.order?.customer?.name ??
          null,
      }));

    // ─────────────────────────────────────────────
    // RESPONSE RATE
    // ─────────────────────────────────────────────

    const responseRate =
      totalTokensGenerated > 0
        ? Number(
            (
              (totalResponses /
                totalTokensGenerated) *
              100
            ).toFixed(1),
          )
        : 0;

    // ─────────────────────────────────────────────
    // RETURN
    // ─────────────────────────────────────────────

    return {
      totalResponses,
      totalTokensGenerated,
      responseRate,

      averages,

      wouldRecommendPct,

      ratingDistribution,

      timeSeries,

      recentResponses,

      metrics: {
        totalRevenue,
        averageTicket,
        avgDeliveryMinutes,
        recurringCustomers,
        lowRatings,
        deliveryTypes,
      },
    };
  }

  // ─────────────────────────────────────────────
  // GERAR TOKEN
  // ─────────────────────────────────────────────

  async generateToken(
    orderId: string,
  ): Promise<string | null> {
    const order =
      await prisma.order.findUnique({
        where: { id: orderId },

        include: {
          customer: true,
          branch: true,
        },
      });

    if (!order) {
      return null;
    }

    const existing =
      await prisma.orderSurveyToken.findUnique({
        where: { orderId },
      });

    if (existing) {
      return existing.token;
    }

    const expiresAt = new Date();

    expiresAt.setDate(
      expiresAt.getDate() +
        SURVEY_EXPIRY_DAYS,
    );

    const surveyToken =
      await prisma.orderSurveyToken.create({
        data: {
          orderId,
          branchId: order.branchId,
          expiresAt,
          sentVia: JSON.stringify([
            'screen',
          ]),
        },
      });

    return surveyToken.token;
  }

  // ─────────────────────────────────────────────
  // VALIDAR TOKEN
  // ─────────────────────────────────────────────

  async validateToken(token: string) {
    const record =
      await prisma.orderSurveyToken.findUnique({
        where: { token },

        include: {
          order: {
            select: {
              orderNumber: true,
              status: true,
              deliveryType: true,
            },
          },

          branch: {
            select: {
              branchName: true,
              logoUrl: true,
              primaryColor: true,
            },
          },

          response: {
            select: {
              id: true,
            },
          },
        },
      });

    if (!record) {
      throw new NotFoundException(
        'Token não encontrado',
      );
    }

    if (record.response) {
      throw new ConflictException(
        'Pesquisa já respondida',
      );
    }

    if (
      new Date() > record.expiresAt
    ) {
      throw new GoneException(
        'Token expirado',
      );
    }

    return {
      branch: record.branch,
      orderNumber:
        record.order.orderNumber,
      deliveryType:
        record.order.deliveryType,
      expiresAt: record.expiresAt,
    };
  }

  // ─────────────────────────────────────────────
  // SUBMETER RESPOSTA
  // ─────────────────────────────────────────────

  async submitResponse(
    token: string,
    dto: CreateOrderSurveyDto,
  ) {
    const record =
      await prisma.orderSurveyToken.findUnique({
        where: { token },

        include: {
          response: {
            select: {
              id: true,
            },
          },
        },
      });

    if (!record) {
      throw new NotFoundException(
        'Token não encontrado',
      );
    }

    if (record.response) {
      throw new ConflictException(
        'Pesquisa já respondida',
      );
    }

    if (
      new Date() > record.expiresAt
    ) {
      throw new GoneException(
        'Token expirado',
      );
    }

    const [response] =
      await prisma.$transaction([
        prisma.orderSurveyResponse.create({
          data: {
            tokenId: record.id,
            branchId: record.branchId,
            orderId: record.orderId,

            productQuality:
              dto.productQuality,

            deliveryTime:
              dto.deliveryTime,

            attendantRating:
              dto.attendantRating,

            packagingRating:
              dto.packagingRating,

            wouldRecommend:
              dto.wouldRecommend,

            comment:
              dto.comment ?? null,
          },
        }),

        prisma.orderSurveyToken.update({
          where: {
            id: record.id,
          },

          data: {
            usedAt: new Date(),
          },
        }),
      ]);

    return {
      success: true,
      id: response.id,
    };
  }

  // ─────────────────────────────────────────────
  // TOKEN POR PEDIDO
  // ─────────────────────────────────────────────

  async getTokenByOrder(
    orderId: string,
  ) {
    const record =
      await prisma.orderSurveyToken.findUnique({
        where: { orderId },

        include: {
          branch: {
            select: {
              subdomain: true,
            },
          },
        },
      });

    if (!record) {
      return {
        token: null,
      };
    }

    const baseUrl =
      generateSubdomainUrl(
        record.branch.subdomain || '',
      );

    return {
      token: record.token,

      url: `${baseUrl}pesquisa-pedido/${record.token}`,

      expiresAt:
        record.expiresAt,

      answered:
        !!record.usedAt,

      sentVia: JSON.parse(
        record.sentVia ?? '[]',
      ) as string[],
    };
  }

  // ─────────────────────────────────────────────
  // LISTAR POR FILIAL
  // ─────────────────────────────────────────────

  async findAllByBranch(
    branchId: string,
  ) {
    return prisma.orderSurveyResponse.findMany({
      where: { branchId },

      include: {
        token: {
          include: {
            order: {
              select: {
                orderNumber: true,
                createdAt: true,

                customer: {
                  select: {
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ─────────────────────────────────────────────
  // MÉDIAS DA FILIAL
  // ─────────────────────────────────────────────

  async getAveragesByBranch(
    branchId: string,
  ) {
    const agg =
      await prisma.orderSurveyResponse.aggregate({
        where: {
          branchId,
        },

        _avg: {
          productQuality: true,
          deliveryTime: true,
          attendantRating: true,
          packagingRating: true,
        },

        _count: {
          id: true,
        },
      });

    const wouldRecommendCount =
      await prisma.orderSurveyResponse.count({
        where: {
          branchId,
          wouldRecommend: true,
        },
      });

    const total =
      agg._count.id;

    return {
      total,

      averages: {
        productQuality:
          agg._avg.productQuality,

        deliveryTime:
          agg._avg.deliveryTime,

        attendantRating:
          agg._avg.attendantRating,

        packagingRating:
          agg._avg.packagingRating,
      },

      wouldRecommendPct:
        total > 0
          ? Math.round(
              (wouldRecommendCount /
                total) *
                100,
            )
          : 0,
    };
  }
}