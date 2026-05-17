// ─── Adicionar ao StoreSurveyService ─────────────────────────────────────────
// src/modules/store/store-survey.service.ts

import { Injectable, NotFoundException, GoneException, ConflictException, ForbiddenException } from '@nestjs/common';
import { prisma } from 'lib/prisma';
import { CreateSurveyResponseDto } from './dto/create-survey-response.dto';

// ─── DTO de query ─────────────────────────────────────────────────────────────

export interface SurveyDashboardQuery {
  branchId?: string;
  startDate?: string; // ISO string
  endDate?: string;   // ISO string
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class StoreSurveyService {
  /** HML/prod: defina STORE_SURVEY_ENABLED=true. Dev: ativo por padrão. */
  private readonly isEnabled =
    process.env.STORE_SURVEY_ENABLED === 'true' ||
    process.env.NODE_ENV !== 'production';

  private assertEnabled() {
    if (!this.isEnabled) throw new ForbiddenException('Recurso não disponível neste ambiente.');
  }

  // ── createTokenForOrder / validateToken / submitResponse (existentes) ──────

  async createTokenForOrder(orderId: string, branchId: string): Promise<string | null> {
    if (!this.isEnabled) return null;
    const existing = await prisma.surveyToken.findFirst({ where: { orderId } });
    if (existing) return existing.token;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const record = await prisma.surveyToken.create({ data: { orderId, branchId, expiresAt } });
    return record.token;
  }

  async validateToken(token: string) {
    this.assertEnabled();
    const record = await prisma.surveyToken.findUnique({
      where: { token },
      include: {
        response: true,
        order: { select: { orderNumber: true, createdAt: true } },
        branch: { select: { branchName: true, logoUrl: true, primaryColor: true } },
      },
    });
    if (!record) throw new NotFoundException('Link de pesquisa inválido.');
    if (record.usedAt || record.response) throw new ConflictException('Esta pesquisa já foi respondida. Obrigado pelo feedback!');
    if (new Date() > record.expiresAt) throw new GoneException('Este link expirou. Ele é válido por apenas 1 hora após o pedido.');
    return { valid: true, expiresAt: record.expiresAt, orderNumber: record.order?.orderNumber, branch: record.branch };
  }

  async submitResponse(token: string, dto: CreateSurveyResponseDto) {
    this.assertEnabled();
    const record = await prisma.surveyToken.findUnique({ where: { token }, include: { response: true } });
    if (!record) throw new NotFoundException('Link de pesquisa inválido.');
    if (record.usedAt || record.response) throw new ConflictException('Esta pesquisa já foi respondida.');
    if (new Date() > record.expiresAt) throw new GoneException('Este link expirou.');
    const [response] = await prisma.$transaction([
      prisma.surveyResponse.create({
        data: {
          tokenId: record.id,
          branchId: record.branchId,
          orderId: record.orderId,
          overallRating: dto.overallRating,
          mobileExperience: dto.mobileExperience,
          menuNavigation: dto.menuNavigation,
          productPhotos: dto.productPhotos,
          checkoutEase: dto.checkoutEase,
          wouldRecommend: dto.wouldRecommend,
          comment: dto.comment,
        },
      }),
      prisma.surveyToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    return { success: true, message: 'Obrigado pelo seu feedback! 🙏', responseId: response.id };
  }

  // ─── NOVO: Dashboard unificado ────────────────────────────────────────────

  /**
   * Retorna todas as métricas necessárias para o dashboard em uma única chamada.
   *
   * GET /store/survey/dashboard?branchId=xxx&startDate=ISO&endDate=ISO
   *
   * Se branchId não for informado, agrega todas as filiais.
   * startDate/endDate filtram SurveyResponse.createdAt.
   */
  async getDashboard(query: SurveyDashboardQuery) {
    this.assertEnabled();

    const { branchId, startDate, endDate } = query;

    const dateFilter = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    };

    const branchFilter = branchId ? { branchId } : {};

    // ── 1. Tokens gerados no período ─────────────────────────────────────────
    const totalTokensGenerated = await prisma.surveyToken.count({
      where: {
        ...branchFilter,
        createdAt: dateFilter,
      },
    });

    // ── 2. Respostas no período ───────────────────────────────────────────────
    const responses = await prisma.surveyResponse.findMany({
      where: {
        ...branchFilter,
        createdAt: dateFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        overallRating: true,
        menuNavigation: true,
        productPhotos: true,
        checkoutEase: true,
        mobileExperience: true,
        wouldRecommend: true,
        comment: true,
        createdAt: true,
      },
    });

    const totalResponses = responses.length;

    // ── 3. Taxa de resposta ───────────────────────────────────────────────────
    const responseRate =
      totalTokensGenerated > 0
        ? parseFloat(((totalResponses / totalTokensGenerated) * 100).toFixed(2))
        : 0;

    // ── 4. Médias por critério ────────────────────────────────────────────────
    const avg = (key: keyof (typeof responses)[0]) =>
      totalResponses > 0
        ? parseFloat(
            (responses.reduce((s, r) => s + (r[key] as number), 0) / totalResponses).toFixed(2),
          )
        : 0;

    const averages =
      totalResponses > 0
        ? {
            overallRating: avg('overallRating'),
            menuNavigation: avg('menuNavigation'),
            productPhotos: avg('productPhotos'),
            checkoutEase: avg('checkoutEase'),
            mobileExperience: avg('mobileExperience'),
          }
        : null;

    // ── 5. % que recomendaria ─────────────────────────────────────────────────
    const wouldRecommendPct =
      totalResponses > 0
        ? Math.round((responses.filter((r) => r.wouldRecommend).length / totalResponses) * 100)
        : null;

    // ── 6. Distribuição de notas (1–5) da avaliação geral ────────────────────
    const ratingDistribution = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: responses.filter((r) => r.overallRating === rating).length,
    }));

    // ── 7. Série temporal (agrupada por dia) ──────────────────────────────────
    //
    // Agrupa os dados em buckets de dia, calculando média e contagem.
    // Para períodos curtos (≤2 dias) pode ser agrupado por hora se necessário
    // — aqui mantemos por dia para simplicidade.
    //
    const buckets: Record<string, { sum: number; count: number }> = {};

    for (const r of responses) {
      // Formata como "DD/MM" para exibição legível
      const d = r.createdAt;
      const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets[key]) buckets[key] = { sum: 0, count: 0 };
      buckets[key].sum += r.overallRating;
      buckets[key].count += 1;
    }

    // Ordena pelos dias no sentido cronológico (respostas vieram desc, então invertemos)
    const timeSeries = Object.entries(buckets)
      .map(([period, { sum, count }]) => ({
        period,
        avgRating: parseFloat((sum / count).toFixed(2)),
        count,
      }))
      .reverse(); // volta à ordem cronológica

    // ── 8. Últimas 100 respostas (já carregadas acima, slice) ─────────────────
    const recentResponses = responses.slice(0, 100).map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      totalResponses,
      totalTokensGenerated,
      responseRate,
      averages,
      wouldRecommendPct,
      ratingDistribution,
      timeSeries,
      recentResponses,
    };
  }

  // ─── getResults (existente, mantido para compatibilidade) ─────────────────

  async getResults(branchId: string) {
    this.assertEnabled();
    const responses = await prisma.surveyResponse.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        overallRating: true,
        menuNavigation: true,
        productPhotos: true,
        checkoutEase: true,
        wouldRecommend: true,
        comment: true,
        createdAt: true,
      },
    });
    if (responses.length === 0) return { total: 0, averages: null, wouldRecommendPct: null, responses: [] };
    const avg = (key: keyof (typeof responses)[0]) =>
      Number((responses.reduce((s, r) => s + (r[key] as number), 0) / responses.length).toFixed(2));
    const wouldRecommendPct = Math.round((responses.filter((r) => r.wouldRecommend).length / responses.length) * 100);
    return {
      total: responses.length,
      averages: {
        overallRating: avg('overallRating'),
        menuNavigation: avg('menuNavigation'),
        productPhotos: avg('productPhotos'),
        checkoutEase: avg('checkoutEase'),
      },
      wouldRecommendPct,
      responses,
    };
  }
}