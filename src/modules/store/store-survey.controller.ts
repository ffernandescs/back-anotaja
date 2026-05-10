// src/modules/store/store-survey.controller.ts
// Adicione os endpoints abaixo ao StoreController existente
// OU registre este controller separado no StoreModule

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { StoreSurveyService } from './store-survey.service';
import { CreateSurveyResponseDto } from './dto/create-survey-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface RequestWithUser extends Request {
  user: { userId: string };
}

/**
 * StoreSurveyController
 *
 * Rotas:
 *  GET  /store/survey/:token          → valida token e retorna metadados
 *  POST /store/survey/:token          → registra resposta da pesquisa
 *  GET  /store/survey/results         → resumo para admin (protegido)
 *
 * Feature flag: NODE_ENV !== 'production'
 * O serviço lança ForbiddenException automaticamente em production.
 */
@Controller('store/survey')
export class StoreSurveyController {
  constructor(private readonly surveySvc: StoreSurveyService) {}

  /**
   * Valida o token e retorna dados para renderizar a tela de pesquisa.
   * Público — acessado diretamente pelo link do cliente.
   *
   * Respostas possíveis:
   *   200 → token válido, pesquisa pendente
   *   404 → token não encontrado
   *   409 → já respondida
   *   410 → link expirado
   *   403 → ambiente production
   */

  @Get('results')
  @UseGuards(JwtAuthGuard)
  async getResults(
    @Query('branchId') branchId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.surveySvc.getResults(branchId);
  }

  @Get(':token')
  @Public()
  async validateToken(@Param('token') token: string) {
    return this.surveySvc.validateToken(token);
  }

  /**
   * Registra a resposta do cliente.
   * Público — o cliente acessa via link, sem autenticação.
   *
   * Respostas possíveis:
   *   201 → resposta salva com sucesso
   *   404 → token inválido
   *   409 → já respondida
   *   410 → link expirado
   *   403 → ambiente production
   */
  @Post(':token')
  @Public()
  async submitResponse(
    @Param('token') token: string,
    @Body() dto: CreateSurveyResponseDto,
  ) {
    return this.surveySvc.submitResponse(token, dto);
  }

  /**
   * Retorna resumo agregado das respostas para análise.
   * Protegido — apenas usuários autenticados (admin/staff).
   *
   * Query: ?branchId=xxx
   */
 
}