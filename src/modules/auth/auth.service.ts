import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { securityConfig } from '../../../src/config/security.config';
import { getPlanLimits } from '../../ability/factory/plan-rules';
import { PlanType } from '../../ability/types/ability.types';
import { prisma } from '../../../lib/prisma';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { AbilityLoaderService } from '../../ability/factory/ability-loader.service';
import { MenuService } from '../../ability/factory/menu.service';
import { AbilityFactory } from '../../ability/factory/ability.factory';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { SubscriptionService } from '../subscription/subscription.service';

const OTP_EXPIRES_IN_MINUTES = Number(process.env.OTP_EXPIRES_IN_MINUTES ?? 10);

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private abilityLoaderService: AbilityLoaderService,
    private menuService: MenuService,
    private abilityFactory: AbilityFactory,
    private paymentMethodsService: PaymentMethodsService,
    private subscriptionService: SubscriptionService,
  ) {}

  private async sendResetEmail(email: string, otp: string) {
    await this.mailService.sendResetPasswordEmail(email, otp);
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.password) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.active) {
      throw new UnauthorizedException('Usuário inativo');
    }

    const { password: _, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    const payload = {
      email: user.email || user.phone,
      sub: user.id,
      companyId: user.companyId,
      branchId: user.branchId,
      groupId: user.groupId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(user.id);

    // pedidos pendentes (mantive seu código)
    let pendingOrders: any[] = [];
    if (user.branchId) {
      pendingOrders = await prisma.order.findMany({
        where: {
          branchId: user.branchId,
          status: 'PENDING',
        },
        select: {
          id: true,
          orderNumber: true,
          customer: true,
          total: true,
          deliveryType: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        group: user.group,
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
        permission: user.permissions,

      },
      pendingOrders,
    };
  }

  async verifyOtp(email: string, otp: string) {
    const token = await prisma.passwordResetToken.findFirst({
      where: {
        email,
        otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!token) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    return { message: 'Código validado com sucesso' };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const token = await prisma.passwordResetToken.findFirst({
      where: {
        email,
        otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!token) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    const hashedPassword = await bcrypt.hash(
      newPassword,
      securityConfig.bcryptSaltRounds,
    );

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    await prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { used: true },
    });

    return { message: 'Senha redefinida com sucesso' };
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });

    // 🔐 Segurança: não revela se existe
    if (!user) {
      return {
        message: 'Se o email existir, enviaremos o código',
      };
    }

    // Invalida tokens antigos
    await prisma.passwordResetToken.updateMany({
      where: {
        email,
        used: false,
      },
      data: {
        used: true,
      },
    });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRES_IN_MINUTES);

    await prisma.passwordResetToken.create({
      data: {
        email,
        otp,
        expiresAt,
      },
    });

    // 👇 ENVIO DE EMAIL NÃO PODE QUEBRAR
    const emailSent = await this.mailService.sendResetPasswordEmail(email, otp);

    if (!emailSent) {
      // Loga, mas não quebra
      console.warn(`Token criado, mas email não enviado: ${email}`);
    }

    return {
      message: 'Se o email existir, enviaremos o código',
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new ConflictException('Email já cadastrado');
    }

    const user = await this.usersService.create({
      ...registerDto,
      groupId: undefined,
    });

    const payload = {
      email: user.email || user.phone,
      sub: user.id,
      group: user.group,
    };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: await this.generateRefreshToken(user.id),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        group: user.group,
      },
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const refreshToken = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenDto.refresh_token },
      include: { user: true },
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (refreshToken.expiresAt < new Date()) {
      // Remove token expirado
      await prisma.refreshToken.delete({
        where: { id: refreshToken.id },
      });
      throw new UnauthorizedException('Refresh token expirado');
    }

    if (!refreshToken.user.active) {
      throw new UnauthorizedException('Usuário inativo');
    }

    // Gera novo access token
    const payload = {
      email: refreshToken.user.email || refreshToken.user.phone,
      sub: refreshToken.user.id,
      groupId: refreshToken.user.groupId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      user: {
        id: refreshToken.user.id,
        email: refreshToken.user.email,
        name: refreshToken.user.name,
        phone: refreshToken.user.phone,
        groupId: refreshToken.user.groupId,
        companyId: refreshToken.user.companyId || undefined,
        branchId: refreshToken.user.branchId || undefined,

      },
    };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        active: true,
        companyId: true,
        orders: true,
        branchId: true,
        createdAt: true,
        updatedAt: true,
        company: {
          include: {
            subscription: {
              include: {
                plan: true,
              },
            },
            branches: {
              orderBy: { branchName: 'asc' }
            }
          },
        },
        branch: {
          include:{
            paymentMethods: true,
            orders: {
              include: {
                customer: {
                  include: {
                  addresses: true
                  }
                },
                customerAddress: true
              }
            },
            address:true,
            generalConfig: true
          }
        },
        permissions: true,
        group: {
          include: {
            permissions:true
          },
        },
      },
      
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Se usuário não tem branchId, buscar a primeira branch da empresa
    if (!user.branchId && user.companyId) {
      const firstBranch = await prisma.branch.findFirst({
        where: { companyId: user.companyId },
        include: {
          address: true,
          paymentMethods: true,
          openingHours: true,
        },
      });
      
      if (firstBranch) {
        user.branchId = firstBranch.id;
        // Adicionar a branch ao objeto user
        (user as any).branch = firstBranch;
      }
    }

    // Buscar pedidos pendentes da filial do usuário
    let pendingOrders: any[] = [];
    if (user.branchId) {
      pendingOrders = await prisma.order.findMany({
        where: {
          branchId: user.branchId,
          status: 'PENDING',
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          customer: true,
          deliveryType: true,
          status: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50, // Limitar a 50 pedidos pendentes
      });
    }

    // Carregar permissões do usuário (grupo + overrides)
    let permissions: any[] = [];
    let menu: any[] = [];
    let subscriptionInfo = user.company?.subscription;
    let resourceCounts = {
      users: 0,
      products: 0,
      branches: 0,
      deliveryPeople: 0,
      ordersMonth: 0,
    };
    let growthMetrics = {
      ordersGrowth: 0,
      productsGrowth: 0,
      usersGrowth: 0,
      revenueGrowth: 0,
    };

    if (user.companyId) {
      // 1. Carregar contagens para limites
      const [usersCount, productsCount, branchesCount, deliveryPeopleCount, ordersMonthCount] = await Promise.all([
        prisma.user.count({ where: { branchId: user.branchId } }),
        prisma.product.count({ where: { branchId: user.branchId as string } }),
        prisma.branch.count({ where: { companyId: user.companyId } }),
        prisma.deliveryPerson.count({ where: { branchId: user.branchId as string } }),
        prisma.order.count({
          where: {
            branchId: user.branchId as string,
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
      ]);

      // 2. Calcular métricas de crescimento (comparação com mês anterior)
      const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      
      const [lastMonthOrders, lastMonthProducts, lastMonthUsers] = await Promise.all([
        prisma.order.count({
          where: {
            branchId: user.branchId as string,
            createdAt: {
              gte: lastMonth,
              lt: thisMonth,
            },
          },
        }),
        prisma.product.count({
          where: {
            branchId: user.branchId as string,
            createdAt: {
              gte: lastMonth,
              lt: thisMonth,
            },
          },
        }),
        prisma.user.count({
          where: {
            branchId: user.branchId as string,
            createdAt: {
              gte: lastMonth,
              lt: thisMonth,
            },
          },
        }),
      ]);

      // Calcular crescimento percentual
      growthMetrics = {
        ordersGrowth: lastMonthOrders > 0 ? ((ordersMonthCount - lastMonthOrders) / lastMonthOrders) * 100 : 0,
        productsGrowth: lastMonthProducts > 0 ? ((productsCount - lastMonthProducts) / lastMonthProducts) * 100 : 0,
        usersGrowth: lastMonthUsers > 0 ? ((usersCount - lastMonthUsers) / lastMonthUsers) * 100 : 0,
        revenueGrowth: 0, // TODO: Calcular baseado em faturamento
      };

      resourceCounts = {
        users: usersCount,
        products: productsCount,
        branches: branchesCount,
        deliveryPeople: deliveryPeopleCount,
        ordersMonth: ordersMonthCount,
      };

      // 2. Obter o contexto para filtrar permissões pelo plano
      const ctx = await this.abilityLoaderService.buildContext(user.id, user.companyId);
      
      // 3. Coletar permissões efetivas (grupo + overrides) filtradas pelo plano
      const effectivePermissions: any[] = [];
      let userOverrides: any[] = [];
      
      // Adicionar permissões do grupo (SEM FILTRAR pelo plano)
      if (user.group?.permissions?.length) {
        // ✅ Forma correta de buscar features associadas ao planId
        const planFeatures = await prisma.planFeature.findMany({
          where: {
            planId: user.company?.subscription?.planId
          },
          include: {
            feature: {
              include: {
                featureMenuGroups: {
                  include: {
                    group: true
                  }
                }
              }
            }
          }
        });
        
        effectivePermissions.push(...user.group.permissions);
      }
      
      // Adicionar overrides do usuário (SEM FILTRAR pelo plano)
      if (user.permissions?.length) {
        effectivePermissions.push(...user.permissions);
        userOverrides = user.permissions;
      }
      // ✅ Gerar menu baseado nas features do plano e permissões do usuário
      menu = await this.menuService.generateMenuFromPlanFeatures(
        ctx.tenant.planId,
        ctx.tenant.addons,
        effectivePermissions
      );
      // ✅ permissions no response = permissões efetivas (grupo + overrides)
      permissions = effectivePermissions;

      
      // ✅ USAR MENU DINÂMICO A PARTIR DAS FEATURES com permissões efetivas (grupo + overrides)
     

      // Calcular trialDaysRemaining para o bootstrap/Header
      if (subscriptionInfo && subscriptionInfo.plan.isTrial) {
        const now = new Date();
        
        let trialEndDate: Date | undefined;
        // ✅ Priorizar trialEndsAt do Stripe
        if (subscriptionInfo.trialEndsAt) {
          trialEndDate = new Date(subscriptionInfo.trialEndsAt);
        } else if (subscriptionInfo.endDate) {
          trialEndDate = new Date(subscriptionInfo.endDate);
        } else if (subscriptionInfo.startDate) {
          const trialDays = subscriptionInfo.plan.trialDays ?? 7;
          trialEndDate = new Date(subscriptionInfo.startDate);
          trialEndDate.setDate(trialEndDate.getDate() + trialDays);
        }

        if (trialEndDate) {
          // ✅ Usar UTC para evitar problemas de fuso horário
          const nowUTC = new Date();
          const todayUTC = new Date(Date.UTC(nowUTC.getFullYear(), nowUTC.getMonth(), nowUTC.getDate()));
          const expirationUTC = new Date(Date.UTC(trialEndDate.getFullYear(), trialEndDate.getMonth(), trialEndDate.getDate()));
          
          // ✅ Correção: Calcular dias restantes corretamente em UTC
          const diffTime = expirationUTC.getTime() - todayUTC.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          // Se a data de expiração é hoje, não há dias restantes
          (subscriptionInfo as any).trialDaysRemaining = Math.max(0, diffDays);
        }
      }
    } else {
      // Usuário sem company = menu vazio
      menu = [];
    }

    // ✅ Buscar métodos de pagamento globais (do master owner)
    let globalPaymentMethods: any[] = [];
    try {
      globalPaymentMethods = await this.paymentMethodsService.findAll();
    } catch (error) {
      console.warn('Erro ao buscar métodos de pagamento globais:', error);
      // Não quebra se falhar, apenas retorna array vazio
    }

    // ✅ Buscar invoices do usuário
    let invoices: any[] = [];
    try {
      invoices = await this.subscriptionService.getInvoices(userId);
    } catch (error) {
      console.warn('Erro ao buscar invoices:', error);
      // Não quebra se falhar, apenas retorna array vazio
    }

    // Salvar branches antes de transformar company
    const companyBranches = user.company?.branches || [];

    // Buscar limites do plano de forma assíncrona
    let planLimits: any = null;
    if (subscriptionInfo) {
      try {
        planLimits = await getPlanLimits(subscriptionInfo.plan.type as PlanType);
      } catch (error) {
        console.warn('Erro ao buscar limites do plano:', error);
        planLimits = null;
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        group: user.group,
        active: user.active,
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
        company: user.company ? {
          ...user.company,
          subscription: subscriptionInfo ? {
            ...subscriptionInfo,
            trialDaysRemaining: (subscriptionInfo as any).trialDaysRemaining,
            limits: planLimits
          } : null,
          branches: companyBranches,
        } : undefined,
        branch: user.branch || undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        orders: user.orders || undefined,
        pendingOrders: pendingOrders || [],
        counts: resourceCounts,
        growthMetrics: growthMetrics,
        permission: user.permissions,
        globalPaymentMethods,
        invoices,
        menu,
        limits: planLimits,
      },
    };
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    // Gera token aleatório seguro
    const token = crypto.randomBytes(64).toString('hex');

    // Expira em 30 dias
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Remove tokens antigos do usuário (opcional - pode manter múltiplos)
    // await prisma.refreshToken.deleteMany({
    //   where: { userId },
    // });

    // Salva o token no banco
    await prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    return token;
  }

  async logout(refreshToken: string) {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
    return { message: 'Logout realizado com sucesso' };
  }

  async switchBranch(branchId: string, userId: string) {
    // Verificar se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verificar se a filial existe e pertence à empresa do usuário
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada');
    }

    if (branch.companyId !== user.companyId) {
      throw new UnauthorizedException('A filial não pertence à sua empresa');
    }

    // Atualizar a filial do usuário
    await prisma.user.update({
      where: { id: userId },
      data: { branchId },
    });

    // Gerar novo token JWT com a nova filial
    const payload = {
      email: user.email,
      sub: user.id,
      companyId: user.companyId,
      branchId: branchId,
      groupId: user.groupId,
    };

    const token = this.jwtService.sign(payload);

    // Gerar novo refresh token
    const refreshToken = await this.generateRefreshToken(userId);

    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        branchId,
        companyId: user.companyId,
        groupId: user.groupId,
      },
    };
  }
}
