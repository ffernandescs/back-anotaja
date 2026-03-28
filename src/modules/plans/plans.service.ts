import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateDynamicPlanDto } from './dto/create-dynamic-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { prisma } from '../../../lib/prisma';
import { BillingPeriod, ChoosePlanDto } from './dto/choose-plan.dto';
import { FeaturePermissionsService } from '../../ability/factory/feature-permissions.service';

@Injectable()
export class PlansService {
  constructor(private readonly featurePermissions: FeaturePermissionsService) {}
  async create(createPlanDto: CreatePlanDto) {
    // Extrair features e limits do DTO se existirem
    const { features, limits, ...planData } = createPlanDto;

    // Parse features e limits se forem strings JSON
    let parsedFeatures: string[] | null = null;
    let parsedLimits: Record<string, number> | null = null;

    if (features) {
      try {
        parsedFeatures = typeof features === 'string' ? JSON.parse(features) : features;
      } catch (error) {
        throw new BadRequestException('Formato inválido para features');
      }
    }

    if (limits) {
      try {
        parsedLimits = typeof limits === 'string' ? JSON.parse(limits) : limits;
      } catch (error) {
        throw new BadRequestException('Formato inválido para limits');
      }
    }

    // Criar o plano
    const plan = await prisma.plan.create({
      data: {
        ...planData,
        billingPeriod: createPlanDto.billingPeriod || 'MONTHLY',
        active: createPlanDto.active ?? true,
        isTrial: createPlanDto.isTrial ?? false,
        isFeatured: createPlanDto.isFeatured ?? false,
        displayOrder: createPlanDto.displayOrder ?? 0,
        trialDays: createPlanDto.trialDays ?? 7,
        features: parsedFeatures ? JSON.stringify(parsedFeatures) : null,
        limits: parsedLimits ? JSON.stringify(parsedLimits) : null,
      },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    // Se houver features no array, associá-las ao plano
    if (parsedFeatures && Array.isArray(parsedFeatures)) {
      // Buscar todas as features para verificar hierarquia
      const allFeatures = await prisma.feature.findMany({
        where: { 
          key: { in: parsedFeatures },
          active: true
        },
        include: {
          parent: {
            select: { id: true, key: true }
          }
        }
      });

      // Encontrar features principais que precisam ser incluídas
      const mainFeaturesToAdd = new Set<string>();
      
      // Adicionar features selecionadas
      parsedFeatures.forEach(featureKey => {
        const feature = allFeatures.find(f => f.key === featureKey);
        if (feature) {
          // Se for subfeature, adicionar a feature principal também
          if (feature.parent) {
            mainFeaturesToAdd.add(feature.parent.key);
          }
          mainFeaturesToAdd.add(featureKey);
        }
      });

      // Converter para array e ordenar
      const finalFeatures = Array.from(mainFeaturesToAdd).sort();

      // Adicionar associações (incluindo features principais)
      for (const featureKey of finalFeatures) {
        const feature = await prisma.feature.findUnique({
          where: { key: featureKey },
        });

        if (feature) {
          await prisma.planFeature.create({
            data: {
              planId: plan.id,
              featureId: feature.id,
            },
          });
        }
      }
    }

    // Se houver limits no objeto, criar FeatureLimit entries (nova estrutura)
    if (limits && typeof limits === 'object') {
      // TODO: Implementar criação de FeatureLimit quando tabela estiver disponível
     
    }

    return this.findOne(plan.id);
  }

  async findAll() {
    return prisma.plan.findMany({
      where: { active: true },
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' }
      ],
      include: {
        _count: {
          select: {
            subscriptions: true,
            planFeatures: true,
          },
        },
        planFeatures: {
          include: {
            feature: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const plan = await prisma.plan.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
        planFeatures: {
          include: {
            feature: true,
          },
        },
        featureLimits: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return plan;
  }

  async update(id: string, updatePlanDto: UpdatePlanDto) {
    const plan = await this.findOne(id);

    // Extrair features e limits do DTO se existirem
    const { features, limits, ...planData } = updatePlanDto;

    // Parse features e limits se forem strings JSON
    let parsedFeatures: string[] | null = null;
    let parsedLimits: Record<string, number> | null = null;

    if (features) {
      try {
        parsedFeatures = typeof features === 'string' ? JSON.parse(features) : features;
      } catch (error) {
        throw new BadRequestException('Formato inválido para features');
      }
    }

    if (limits) {
      try {
        parsedLimits = typeof limits === 'string' ? JSON.parse(limits) : limits;
      } catch (error) {
        throw new BadRequestException('Formato inválido para limits');
      }
    }

    // Atualizar o plano
    const updatedPlan = await prisma.plan.update({
      where: { id },
      data: {
        ...planData,
        features: parsedFeatures ? JSON.stringify(parsedFeatures) : undefined,
        limits: parsedLimits ? JSON.stringify(parsedLimits) : undefined,
      },
      include: {
        _count: {
          select: {
            subscriptions: true,
            planFeatures: true,
          },
        },
        planFeatures: {
          include: {
            feature: true,
          },
        },
      },
    });

    // Se houver features no array, atualizar associações
    if (parsedFeatures && Array.isArray(parsedFeatures)) {
      // Buscar todas as features para verificar hierarquia
      const allFeatures = await prisma.feature.findMany({
        where: { 
          key: { in: parsedFeatures },
          active: true
        },
        include: {
          parent: {
            select: { id: true, key: true }
          }
        }
      });

      // Encontrar features principais que precisam ser incluídas
      const mainFeaturesToAdd = new Set<string>();
      
      // Adicionar features selecionadas
      parsedFeatures.forEach(featureKey => {
        const feature = allFeatures.find(f => f.key === featureKey);
        if (feature) {
          // Se for subfeature, adicionar a feature principal também
          if (feature.parent) {
            mainFeaturesToAdd.add(feature.parent.key);
          }
          mainFeaturesToAdd.add(featureKey);
        }
      });

      // Converter para array e ordenar
      const finalFeatures = Array.from(mainFeaturesToAdd).sort();

      // Remover associações existentes
      await prisma.planFeature.deleteMany({
        where: { planId: id },
      });

      // Adicionar novas associações (incluindo features principais)
      for (const featureKey of finalFeatures) {
        const feature = await prisma.feature.findUnique({
          where: { key: featureKey },
        });

        if (feature) {
          await prisma.planFeature.create({
            data: {
              planId: id,
              featureId: feature.id,
            },
          });
        }
      }
    }

    // Se houver limits no objeto, criar FeatureLimit entries (nova estrutura)
    if (parsedLimits && typeof parsedLimits === 'object') {
      // Remover limites existentes da estrutura antiga (se existir)
      // TODO: Implementar quando FeatureLimit estiver disponível
      
      // Adicionar novos limites (nova estrutura)
     
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    // Verificar se o plano existe
    await this.findOne(id);

    // Verificar se há assinaturas ativas usando este plano
    const activeSubscriptions = await prisma.subscription.count({
      where: {
        planId: id,
        status: 'ACTIVE',
      },
    });

    if (activeSubscriptions > 0) {
      throw new ConflictException(
        `Não é possível deletar o plano. Existem ${activeSubscriptions} assinatura(s) ativa(s) usando este plano.`,
      );
    }

    // Não deletar, apenas desativar
    return prisma.plan.update({
      where: { id },
      data: { active: false },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  async findActive() {
    return prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  async findFeatured() {
    return prisma.plan.findMany({
      where: {
        active: true,
        isFeatured: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  private calculateNextBillingDate(date: Date, billingPeriod: BillingPeriod) {
    const next = new Date(date);

    if (billingPeriod === BillingPeriod.MONTHLY) {
      next.setMonth(next.getMonth() + 1);
    }

    if (billingPeriod === BillingPeriod.SEMESTRAL) {
      next.setMonth(next.getMonth() + 6);
    }

    if (billingPeriod === BillingPeriod.ANNUAL) {
      next.setFullYear(next.getFullYear() + 1);
    }

    return next;
  }

  async choosePlanForCompany(dto: ChoosePlanDto) {
    const { planId, billingPeriod } = dto;

    // Verificar se o plano existe
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    // Buscar ou criar uma empresa padrão para testes
    let company = await prisma.company.findFirst();
    
    if (!company) {
      // Criar empresa padrão se não existir
      company = await prisma.company.create({
        data: {
          name: 'Empresa Padrão',
          companyName: 'Empresa Padrão LTDA',
          document: '00000000000000',
          email: 'empresa@padrao.com',
          phone: '00000000000',
          active: true,
        },
      });
    }

    // Criar nova assinatura
    const now = new Date();
    const endDate = this.calculateNextBillingDate(now, billingPeriod);
    const nextBillingDate = this.calculateNextBillingDate(endDate, billingPeriod);

    const subscription = await prisma.subscription.create({
      data: {
        planId: plan.id,
        companyId: company.id,
        status: 'ACTIVE',
        billingPeriod,
        startDate: now,
        endDate,
        nextBillingDate,
        notes: 'Assinatura criada manualmente',
      },
      include: {
        plan: true,
        company: true,
      },
    });

    return subscription;
  }

  // Métodos para gestão de features do plano
  async addFeature(planId: string, featureId: string) {
    // Verificar se plano existe
    await this.findOne(planId);

    // Verificar se feature existe
    const feature = await prisma.feature.findUnique({
      where: { id: featureId },
    });

    if (!feature) {
      throw new NotFoundException('Feature não encontrada');
    }

    // Verificar se a associação já existe
    const existingAssociation = await prisma.planFeature.findUnique({
      where: {
        planId_featureId: {
          planId,
          featureId,
        },
      },
    });

    if (existingAssociation) {
      throw new ConflictException('Feature já está associada a este plano');
    }

    return prisma.planFeature.create({
      data: {
        planId,
        featureId,
      },
      include: {
        feature: true,
      },
    });
  }

  async removeFeature(planId: string, featureId: string) {
    // Verificar se plano existe
    await this.findOne(planId);

    // Verificar se a associação existe
    const existingAssociation = await prisma.planFeature.findUnique({
      where: {
        planId_featureId: {
          planId,
          featureId,
        },
      },
    });

    if (!existingAssociation) {
      throw new NotFoundException('Feature não está associada a este plano');
    }

    return prisma.planFeature.delete({
      where: {
        planId_featureId: {
          planId,
          featureId,
        },
      },
    });
  }

  // Métodos para gestão de limites do plano (nova estrutura FeatureLimit)
  async updateLimit(planId: string, featureKey: string, limitData: {
    name: string;
    description?: string;
    maxValue: number;
    unit?: string;
    isActive?: boolean;
  }) {
    // Verificar se plano existe
    await this.findOne(planId);

    // TODO: Implementar quando a tabela FeatureLimit estiver disponível
    return this.findOne(planId);
  }

  async removeLimit(planId: string, featureKey: string) {
    // TODO: Implementar quando a tabela FeatureLimit estiver disponível
    return this.findOne(planId);
  }

  async getPlanLimits(planId: string) {
    // TODO: Implementar quando a tabela FeatureLimit estiver disponível
    return [];
  }

  /**
   * Cria um plano de forma dinâmica baseado nas features selecionadas
   */
  async createDynamic(createPlanDto: CreateDynamicPlanDto) {
    const { features, limits, ...planData } = createPlanDto;

    // Validar se todas as features existem
    const availableFeatures = await this.featurePermissions.listAllFeaturesWithPermissions();
    const validFeatureKeys = availableFeatures.map(f => f.key);
    
    for (const featureKey of features) {
      if (!validFeatureKeys.includes(featureKey)) {
        throw new BadRequestException(`Feature '${featureKey}' não é válida`);
      }
    }

    // Criar o plano
    const plan = await prisma.plan.create({
      data: {
        ...planData,
        billingPeriod: (createPlanDto.billingPeriod as any) || 'MONTHLY',
        active: createPlanDto.active ?? true,
        isTrial: createPlanDto.isTrial ?? false,
        isFeatured: createPlanDto.isFeatured ?? false,
        displayOrder: createPlanDto.displayOrder ?? 0,
        trialDays: createPlanDto.trialDays ?? 7,
        features: JSON.stringify(features), // Armazenar features no campo JSON
      },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    // Associar features ao plano
    for (const featureKey of features) {
      const feature = await prisma.feature.findUnique({
        where: { key: featureKey },
      });

      if (feature) {
        await prisma.planFeature.create({
          data: {
            planId: plan.id,
            featureId: feature.id,
          },
        });
      }
    }

    // Criar limites se fornecidos
    if (limits && limits.length > 0) {
      for (const limit of limits) {
        // TODO: Implementar criação de FeatureLimit quando tabela estiver disponível
      }
    }

    return this.findOne(plan.id);
  }

  /**
   * Lista features disponíveis para criação de planos
   */
  async listAvailableFeatures() {
    return this.featurePermissions.listAllFeaturesWithPermissions();
  }

  /**
   * Ativa/Desativa um plano
   */
  async toggleActive(id: string) {
    const plan = await prisma.plan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return prisma.plan.update({
      where: { id },
      data: { active: !plan.active },
    });
  }
}
