// src/modules/store/store-survey.service.ts

import {
  Injectable,
  NotFoundException,
  GoneException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma } from 'lib/prisma';
import { CreateSurveyResponseDto } from './dto/create-survey-response.dto';

/**
 * SurveySurveyService
 *
 * Regras de negócio:
 * - Disponível apenas fora de production (NODE_ENV !== 'production')
 * - Token expira em 1 hora após criação
 * - Um token só pode ser respondido uma vez
 * - Um novo pedido gera um novo token (permitindo nova resposta)
 */
@Injectable()
export class StoreSurveyService {
  private readonly isEnabled = process.env.NODE_ENV !== 'production';

  /** Garante que a feature está ativa */
  private assertEnabled() {
    if (!this.isEnabled) {
      throw new ForbiddenException('Recurso não disponível neste ambiente.');
    }
  }

  /**
   * Cria (ou reutiliza) um SurveyToken para um pedido.
   * Chamado internamente após criação de pedido bem-sucedida.
   */
  async createTokenForOrder(orderId: string, branchId: string): Promise<string | null> {
    if (!this.isEnabled) return null;

    // Se já existe um token para este pedido, retorna o mesmo
    const existing = await prisma.surveyToken.findFirst({
      where: { orderId },
    });
    if (existing) return existing.token;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // +1h

    const record = await prisma.surveyToken.create({
      data: {
        orderId,
        branchId,
        expiresAt,
      },
    });

    return record.token;
  }

  /**
   * Valida um token e retorna metadados para o front.
   * GET /store/survey/:token
   */
  async validateToken(token: string) {
    this.assertEnabled();

    const record = await prisma.surveyToken.findUnique({
      where: { token },
      include: {
        response: true,
        order: {
          select: {
            orderNumber: true,
            createdAt: true,
          },
        },
        branch: {
          select: {
            branchName: true,
            logoUrl: true,
            primaryColor: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Link de pesquisa inválido.');
    }

    if (record.usedAt || record.response) {
      throw new ConflictException('Esta pesquisa já foi respondida. Obrigado pelo feedback!');
    }

    if (new Date() > record.expiresAt) {
      throw new GoneException('Este link expirou. Ele é válido por apenas 1 hora após o pedido.');
    }

    return {
      valid: true,
      expiresAt: record.expiresAt,
      orderNumber: record.order?.orderNumber,
      branch: record.branch,
    };
  }

  /**
   * Registra a resposta da pesquisa.
   * POST /store/survey/:token
   */
  async submitResponse(token: string, dto: CreateSurveyResponseDto) {
    this.assertEnabled();

    const record = await prisma.surveyToken.findUnique({
      where: { token },
      include: { response: true },
    });

    if (!record) {
      throw new NotFoundException('Link de pesquisa inválido.');
    }

    if (record.usedAt || record.response) {
      throw new ConflictException('Esta pesquisa já foi respondida.');
    }

    if (new Date() > record.expiresAt) {
      throw new GoneException('Este link expirou.');
    }

    // Transação: criar resposta + marcar token como usado
    const [response] = await prisma.$transaction([
      prisma.surveyResponse.create({
        data: {
          tokenId: record.id,
          branchId: record.branchId,
          orderId: record.orderId,
          overallRating: dto.overallRating,
          mobileExperience:dto.mobileExperience,
          menuNavigation: dto.menuNavigation,
          productPhotos: dto.productPhotos,
          checkoutEase: dto.checkoutEase,
          wouldRecommend: dto.wouldRecommend,
          comment: dto.comment,
        },
      }),
      prisma.surveyToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return {
      success: true,
      message: 'Obrigado pelo seu feedback! 🙏',
      responseId: response.id,
    };
  }

  /**
   * Retorna resumo das respostas de uma branch (para análise interna).
   * GET /store/survey/results?branchId=xxx
   * Protegido por JwtAuthGuard — apenas uso interno/admin.
   */
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

    if (responses.length === 0) {
      return { total: 0, averages: null, wouldRecommendPct: null, responses: [] };
    }

    const avg = (key: keyof typeof responses[0]) =>
      Number(
        (responses.reduce((sum, r) => sum + (r[key] as number), 0) / responses.length).toFixed(2),
      );

    const wouldRecommendPct = Math.round(
      (responses.filter((r) => r.wouldRecommend).length / responses.length) * 100,
    );

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