import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  Headers,
} from '@nestjs/common';
import type { Request } from 'express';
import { PlansService } from './plans.service';
import { PlanSyncService } from './plan-sync.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateDynamicPlanDto } from './dto/create-dynamic-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtOwnerAuthGuard } from '../../common/guards/jwt-owner.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ChoosePlanDto } from './dto/choose-plan.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('plans')
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly planSyncService: PlanSyncService,
  ) {}

  @Public()
  @Post()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  create(
    @Body() createPlanDto: CreatePlanDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.plansService.create(createPlanDto);
  }

  @Public()
  @Post('dynamic')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  createDynamic(
    @Body() createPlanDto: CreateDynamicPlanDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.plansService.createDynamic(createPlanDto);
  }

    @Get()
  @Roles('master')
  findAll(@Req() req?: Request) {
    return this.plansService.findAll();
  }

  @Public()
  @Get('Owner')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findAlOwner(@Req() req?: Request) {
    return this.plansService.findAll();
  }



  @Public()
  @Get('active')
  findActive() {
    return this.plansService.findActive();
  }



  @Public()
  @Get('featured')
  findFeatured() {
    return this.plansService.findFeatured();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Public()
  @Patch(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async update(
    @Param('id') id: string,
    @Body() updatePlanDto: UpdatePlanDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    const updatedPlan = await this.plansService.update(id, updatePlanDto);
    
    // ✅ Sincronizar permissões se o plano foi atualizado
    if (updatedPlan) {
      try {
        await this.planSyncService.syncPlanPermissions(id);
      } catch (error) {
        console.error('Erro ao sincronizar permissões do plano:', error);
        // Não falhar a atualização se a sincronização falhar
      }
    }
    
    return updatedPlan;
  }

  @Public()
  @Delete(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.plansService.remove(id);
  }

  @Public()
  @Post('choose')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  choosePlan(
    @Body() dto: ChoosePlanDto,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    return this.plansService.choosePlanForCompany(dto);
  }

  // Endpoints para gestão de features do plano
  @Public()
  @Post(':id/features/:featureId')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  addFeature(
    @Param('id') planId: string,
    @Param('featureId') featureId: string,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    return this.plansService.addFeature(planId, featureId);
  }

  @Public()
  @Delete(':id/features/:featureId')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  removeFeature(
    @Param('id') planId: string,
    @Param('featureId') featureId: string,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    return this.plansService.removeFeature(planId, featureId);
  }

  @Public()
  @Patch(':id/toggle')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  toggleActive(
    @Param('id') id: string,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    return this.plansService.toggleActive(id);
  }

  // Endpoints para gestão de limites do plano
  @Public()
  @Patch(':id/limits/:resource')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  updateLimit(
    @Param('id') planId: string,
    @Param('resource') resource: string,
    @Body() body: { maxValue: number },
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    // TODO: Implementar com a nova estrutura quando FeatureLimit estiver disponível
    // Por enquanto, criar um objeto compatível
    const limitData = {
      name: `Limit for ${resource}`,
      description: `Limit for resource: ${resource}`,
      maxValue: body.maxValue,
      unit: 'items',
      isActive: true
    };
    
    return this.plansService.updateLimit(planId, resource, limitData);
  }

  @Public()
  @Delete(':id/limits/:resource')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  removeLimit(
    @Param('id') planId: string,
    @Param('resource') resource: string,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    return this.plansService.removeLimit(planId, resource);
  }

  // ✅ Endpoints para sincronização de permissões
  @Public()
  @Post(':id/sync')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async syncPlanPermissions(
    @Param('id') planId: string,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    await this.planSyncService.syncPlanPermissions(planId);
    return { message: 'Permissões sincronizadas com sucesso' };
  }

  @Public()
  @Post('sync/company/:companyId')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async syncCompanyPermissions(
    @Param('companyId') companyId: string,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    await this.planSyncService.syncCompanyPermissions(companyId);
    return { message: 'Permissões da empresa sincronizadas com sucesso' };
  }

  @Public()
  @Post('sync/branch/:branchId')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async syncBranchPermissions(
    @Param('branchId') branchId: string,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    await this.planSyncService.syncBranchPermissions(branchId);
    return { message: 'Permissões da branch sincronizadas com sucesso' };
  }
}
