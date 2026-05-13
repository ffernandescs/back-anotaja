// src/modules/store/store-survey.controller.ts

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
import { JwtOwnerAuthGuard } from 'src/common/guards/jwt-owner.guard';

interface RequestWithUser extends Request {
  user: { userId: string };
}

@Controller('store/survey')
export class StoreSurveyController {
  constructor(private readonly surveySvc: StoreSurveyService) {}

  /**
   * Dashboard unificado — todas as métricas em uma única chamada.
   * Protegido por JWT (uso interno / painel master).
   *
   * GET /store/survey/dashboard
   * Query params:
   *   branchId?  — filtra por filial específica (omitir = todas as filiais)
   *   startDate? — ISO string (ex: 2024-01-01T00:00:00.000Z)
   *   endDate?   — ISO string
   *
   * Response: SurveyDashboardResponse
   */
  @Public()
  @Get('dashboard')
  @UseGuards(JwtOwnerAuthGuard)
  async getDashboard(
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: RequestWithUser,
  ) {
    if (!req?.user?.userId) throw new UnauthorizedException('Usuário não autenticado');
    return this.surveySvc.getDashboard({ branchId, startDate, endDate });
  }

  /**
   * Resumo simples por filial (mantido para compatibilidade com a tela anterior).
   *
   * GET /store/survey/results?branchId=xxx
   */
  @Get('results')
  @UseGuards(JwtAuthGuard)
  async getResults(
    @Query('branchId') branchId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.userId) throw new UnauthorizedException('Usuário não autenticado');
    return this.surveySvc.getResults(branchId);
  }

  /**
   * Valida token e retorna metadados para renderizar a tela de pesquisa.
   * Público — acessado diretamente pelo link do cliente.
   */
  @Get(':token')
  @Public()
  async validateToken(@Param('token') token: string) {
    return this.surveySvc.validateToken(token);
  }

  /**
   * Registra resposta do cliente.
   * Público — acesso via link sem autenticação.
   */
  @Post(':token')
  @Public()
  async submitResponse(
    @Param('token') token: string,
    @Body() dto: CreateSurveyResponseDto,
  ) {
    return this.surveySvc.submitResponse(token, dto);
  }
}