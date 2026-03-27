import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { CreateLimitDto } from './dto/create-limit.dto';
import { UpdateLimitDto } from './dto/update-limit.dto';

@Injectable()
export class LimitsService {

  async create(createLimitDto: CreateLimitDto) {
    const { planId, featureKey, name, description, maxValue, unit, isActive } = createLimitDto;

    // Verificar se o plano existe
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Criar FeatureLimit com dados:', createLimitDto);
    
    // Retornar um objeto mock temporário
    return {
      id: 'temp-id',
      planId,
      featureKey,
      name,
      description,
      maxValue,
      unit,
      isActive: isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async findAll(planId?: string) {
    // TODO: Implementar quando FeatureLimit estiver disponível
    if (planId) {
      console.log('TODO: Buscar FeatureLimits por plano:', planId);
    } else {
      console.log('TODO: Buscar todos os FeatureLimits');
    }
    return [];
  }

  async findOne(id: string) {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Buscar FeatureLimit por ID:', id);
    return null;
  }

  async update(id: string, updateLimitDto: UpdateLimitDto) {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Atualizar FeatureLimit:', id, updateLimitDto);
    return null;
  }

  async remove(id: string) {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Remover FeatureLimit:', id);
    return null;
  }

  async findByPlan(planId: string) {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Buscar FeatureLimits por plano:', planId);
    return [];
  }

  async findByResource(resource: string) {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Buscar FeatureLimits por recurso:', resource);
    return [];
  }

  async removeAllByPlan(planId: string) {
    // Verificar se o plano existe
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Remover todos os FeatureLimits do plano:', planId);
    return { count: 0 };
  }

  // Método para obter estatísticas de limites
  async getStats() {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Obter estatísticas de FeatureLimits');
    return {
      totalLimits: 0,
      limitsByResource: [],
      limitsByPlan: []
    };
  }
}
