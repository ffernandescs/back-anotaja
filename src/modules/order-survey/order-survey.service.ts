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
  const domain = (process.env.FRONTEND_URL || '').replace(/^https?:\/\//, '');

  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  const baseUrl = domain ? `${protocol}://${subdomain}.${domain}` : `${protocol}://${subdomain}`;

  return baseUrl;
}

@Injectable()
export class OrderSurveyService {

  // ─── Gerar token (chamado quando Order.status → COMPLETED) ─────────────────
  async generateToken(orderId: string): Promise<string | null> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        branch: true, // whatsappConfig removido do include pois não é mais necessário
      },
    });

    if (!order) return null;

    // Idempotente: retorna token existente se já foi gerado
    const existing = await prisma.orderSurveyToken.findUnique({
      where: { orderId },
    });
    if (existing) return existing.token;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SURVEY_EXPIRY_DAYS);

    const surveyToken = await prisma.orderSurveyToken.create({
      data: {
        orderId,
        branchId: order.branchId,
        expiresAt,
        sentVia: JSON.stringify(['screen']),
      },
    });

    // Envio WhatsApp REMOVIDO daqui.
    // O StoreService.notifyCustomer já faz o envio com o template do banco,
    // injetando o surveyUrl no template "delivered".

    return surveyToken.token;
  }

  // ─── Validar token (GET público) ────────────────────────────────────────────
  async validateToken(token: string) {
    const record = await prisma.orderSurveyToken.findUnique({
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
        response: { select: { id: true } },
      },
    });

    if (!record) {
      throw new NotFoundException('Token não encontrado');
    }

    if (record.response) {
      throw new ConflictException('Pesquisa já respondida');
    }

    if (new Date() > record.expiresAt) {
      throw new GoneException('Token expirado');
    }

    return {
      branch: record.branch,
      orderNumber: record.order.orderNumber,
      deliveryType: record.order.deliveryType,
      expiresAt: record.expiresAt,
    };
  }

  // ─── Submeter resposta (POST público) ───────────────────────────────────────
  async submitResponse(token: string, dto: CreateOrderSurveyDto) {
    const record = await prisma.orderSurveyToken.findUnique({
      where: { token },
      include: { response: { select: { id: true } } },
    });

    if (!record) {
      throw new NotFoundException('Token não encontrado');
    }

    if (record.response) {
      throw new ConflictException('Pesquisa já respondida');
    }

    if (new Date() > record.expiresAt) {
      throw new GoneException('Token expirado');
    }

    const [response] = await prisma.$transaction([
      prisma.orderSurveyResponse.create({
        data: {
          tokenId: record.id,
          branchId: record.branchId,
          orderId: record.orderId,
          productQuality: dto.productQuality,
          deliveryTime: dto.deliveryTime,
          attendantRating: dto.attendantRating,
          packagingRating: dto.packagingRating,
          wouldRecommend: dto.wouldRecommend,
          comment: dto.comment ?? null,
        },
      }),
      prisma.orderSurveyToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true, id: response.id };
  }

  
  // ─── Buscar token de um pedido (para exibir na tela de acompanhamento) ──────
  async getTokenByOrder(orderId: string) {
    const record = await prisma.orderSurveyToken.findUnique({
      where: { orderId },
      include: {
        branch: {
          select: {
            subdomain: true,
          },
        },
      }
    });

    if (!record) return { token: null };

    

    const baseUrl = generateSubdomainUrl(record.branch.subdomain || '');

    return {
      token: record.token,
      url: `${baseUrl}pesquisa-pedido/${record.token}`,
      expiresAt: record.expiresAt,
      answered: !!record.usedAt,
      sentVia: JSON.parse(record.sentVia ?? '[]') as string[],
    };
  }

  // ─── Listar respostas de uma filial (painel admin) ───────────────────────────
  async findAllByBranch(branchId: string) {
    return prisma.orderSurveyResponse.findMany({
      where: { branchId },
      include: {
        token: {
          include: {
            order: {
              select: {
                orderNumber: true,
                createdAt: true,
                customer: { select: { name: true, phone: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Médias da filial (painel admin) ────────────────────────────────────────
  async getAveragesByBranch(branchId: string) {
    const agg = await prisma.orderSurveyResponse.aggregate({
      where: { branchId },
      _avg: {
        productQuality: true,
        deliveryTime: true,
        attendantRating: true,
        packagingRating: true,
      },
      _count: { id: true },
    });

    const wouldRecommendCount = await prisma.orderSurveyResponse.count({
      where: { branchId, wouldRecommend: true },
    });

    const total = agg._count.id;

    return {
      total,
      averages: {
        productQuality: agg._avg.productQuality,
        deliveryTime: agg._avg.deliveryTime,
        attendantRating: agg._avg.attendantRating,
        packagingRating: agg._avg.packagingRating,
      },
      wouldRecommendPct: total > 0 ? Math.round((wouldRecommendCount / total) * 100) : 0,
    };
  }

  // ─── Envio WhatsApp (privado) ────────────────────────────────────────────────
 
}