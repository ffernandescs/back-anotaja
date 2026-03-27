import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOwnerDto, VerifyOwnerExistsDto } from './dto/create-owner.dto';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OwnerService {
  constructor(
    private readonly mailService: MailService,
  ) {}

  /**
   * Valida CPF brasileiro
   */
  private validateCPF(cpf: string): boolean {
    // Remove caracteres não numéricos
    const cleanCPF = cpf.replace(/\D/g, '');
    
    // CPF deve ter 11 dígitos
    if (cleanCPF.length !== 11) {
      return false;
    }
    
    // Verificar se todos os dígitos são iguais (CPF válido)
    if (/^(\d)\1{11}$/.test(cleanCPF)) {
      return true;
    }
    
    // Lista de CPFs inválidos conhecidos
    const invalidCPFs = [
      '00000000000',
      '11111111111',
      '22222222222',
      '33333333333',
      '44444445444',
      '55555566666',
      '66666677777',
      '77777778888',
      '88888889999',
      '99999999999',
    ];
    
    return !invalidCPFs.includes(cleanCPF);
  }

  /**
   * Cria um novo owner (superusuário) usando MasterUser
   */
  async createOwner(dto: CreateOwnerDto) {
    const { name, email, password, cpf, description } = dto;

    // ✅ Validações básicas
    if (!name || !email || !password) {
      throw new BadRequestException(
        'Nome, email e senha são obrigatórios.',
      );
    }

    // ✅ Validação de CPF (se fornecido)
    if (cpf && !this.validateCPF(cpf)) {
      throw new BadRequestException('CPF inválido.');
    }

    // ✅ Verificar se email já existe
    const existingOwner = await prisma.masterUser.findUnique({
      where: { email },
    });

    if (existingOwner) {
      throw new ConflictException('Email já está em uso.');
    }

    // ✅ Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Criar owner usando MasterUser
    const owner = await prisma.masterUser.create({
      data: {
        name,
        email,
        password: hashedPassword,
        active: true,
      },
    });

    // ✅ Enviar email de boas-vindas
    // TODO: Implementar template de email de boas-vindas
    // await this.mailService.sendWelcomeEmail(email, name);

    return {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      active: owner.active,
      createdAt: owner.createdAt,
    };
  }

  /**
   * Busca dados detalhados de uma empresa específica
   */
  async findCompanyById(id: string) {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        address: true,
        subscription: {
          include: {
            plan: true,
            addons: {
              include: {
                addon: true,
              },
            },
            invoices: {
              orderBy: { createdAt: 'desc' },
              take: 10, // Últimas 10 invoices
            },
          },
        },
        branches: {
          include: {
            _count: {
              select: {
                users: true,
                products: true,
                categories: true,
                customers: true,
                orders: true,
              },
            },
            address: true,
            categories: {
              include: {
                _count: {
                  select: {
                    products: true,
                  },
                },
              },
            },
            customers: {
              include: {
                _count: {
                  select: {
                    orders: true,
                  },
                },
              },
            },
            orders: {
              include: {
                payments: true,
                _count: {
                  select: {
                    items: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 20, // Últimos 20 pedidos por branch
            },
          },
        },
        users: {
          include: {
            _count: {
              select: {
                orders: true,
              },
            },
          },
        },
        products: {
          include: {
            category: true,
            branch: true,
            _count: {
              select: {
                orderItems: true,
              },
            },
          },
        },
        groups: {
          include: {
            _count: {
              select: {
                users: true,
              },
            },
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // Calcular estatísticas agregadas
    const allOrders = company.branches.flatMap(branch => branch.orders || []);
    
    // Estatísticas de pedidos por tipo
    const ordersByType = {
      delivery: allOrders.filter(order => order.deliveryType === 'DELIVERY').length,
      pickup: allOrders.filter(order => order.deliveryType === 'PICKUP').length,
      dineIn: allOrders.filter(order => order.deliveryType === 'DINE_IN').length,
    };

    // Estatísticas por forma de pagamento
    const allPayments = allOrders.flatMap(order => order.payments || []);
    const paymentsByType = allPayments.reduce((acc, payment) => {
      const type = payment.type || 'UNKNOWN';
      acc[type] = (acc[type] || 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);

    // Estatísticas de invoices
    const invoices = company.subscription?.invoices || [];
    const totalInvoices = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const paidInvoices = invoices.filter(inv => inv.status === 'PAID').reduce((sum, inv) => sum + inv.amount, 0);
    const pendingInvoices = invoices.filter(inv => inv.status === 'PENDING').reduce((sum, inv) => sum + inv.amount, 0);

    // Estatísticas por branch
    const branchStats = company.branches.map(branch => {
      const branchOrders = branch.orders || [];
      const branchPayments = branchOrders.flatMap(order => order.payments || []);
      
      // Tipos de pedido no branch
      const branchOrdersByType = {
        delivery: branchOrders.filter(order => order.deliveryType === 'DELIVERY').length,
        pickup: branchOrders.filter(order => order.deliveryType === 'PICKUP').length,
        dineIn: branchOrders.filter(order => order.deliveryType === 'DINE_IN').length,
      };

      // Formas de pagamento no branch
      const branchPaymentsByType = branchPayments.reduce((acc, payment) => {
        const type = payment.type || 'UNKNOWN';
        acc[type] = (acc[type] || 0) + payment.amount;
        return acc;
      }, {} as Record<string, number>);

      // Total de vendas do branch
      const totalSales = branchOrders.reduce((sum, order) => sum + order.total, 0);

      return {
        id: branch.id,
        name: branch.branchName,
        address: branch.address,
        users: branch._count?.users || 0,
        products: branch._count?.products || 0,
        categories: branch.categories?.length || 0,
        customers: branch.customers?.length || 0,
        orders: branch._count?.orders || 0,
        ordersByType: branchOrdersByType,
        paymentsByType: branchPaymentsByType,
        totalSales,
      };
    });

    const stats = {
      totalUsers: company.users.length,
      totalBranches: company.branches.length,
      totalProducts: company.products.length,
      totalCategories: company.branches.reduce((sum, branch) => sum + (branch.categories?.length || 0), 0),
      totalCustomers: company.branches.reduce((sum, branch) => sum + (branch.customers?.length || 0), 0),
      totalGroups: company.groups.length,
      totalOrders: allOrders.length,
      totalProductsSold: company.products.reduce((sum, product) => sum + (product._count?.orderItems || 0), 0),
      totalRevenue: allOrders.reduce((sum, order) => sum + order.total, 0),
      ordersByType,
      paymentsByType,
      invoices: {
        total: invoices.length,
        totalAmount: totalInvoices,
        paidAmount: paidInvoices,
        pendingAmount: pendingInvoices,
        recentInvoices: invoices.slice(0, 5),
      },
    };

    return {
      ...company,
      stats,
      branchStats,
    };
  }

  /**
   * Busca todas as empresas cadastradas no sistema
   */
  async findAllCompanies() {
    const companies = await prisma.company.findMany({
      where: { active: true },
      include: {
        _count: {
          select: {
            users: true,
            branches: true,
            products: true,
          },
        },
        subscription: {
          include: {
            plan: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
        address: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return companies;
  }

  /**
   * Verifica se owner existe com base nos campos fornecidos
   */
  async verifyOwnerExists(dto: VerifyOwnerExistsDto) {
    const { email, phone } = dto;

    if (!email && !phone) {
      throw new BadRequestException('Email ou telefone é obrigatório.');
    }

    const where: any = {};
    
    if (email) {
      where.email = email;
    }
    
    if (phone) {
      where.phone = phone;
    }

    const existingOwner = await prisma.masterUser.findFirst({
      where,
      select: {
        id: true,
        email: true,
      },
    });

    return {
      exists: !!existingOwner,
      data: existingOwner || {},
    };
  }

  /**
   * Busca todos os owners
   */
  async findAll() {
    const owners = await prisma.masterUser.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return owners;
  }

  /**
   * Busca owner por ID
   */
  async findById(id: string) {
    const owner = await prisma.masterUser.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
      },
    });

    if (!owner) {
      throw new NotFoundException('Owner não encontrado');
    }

    return owner;
  }

  /**
   * Atualiza owner
   */
  async update(id: string, dto: any) {
    const owner = await prisma.masterUser.findUnique({
      where: { id },
    });

    if (!owner) {
      throw new NotFoundException('Owner não encontrado');
    }

    const updatedOwner = await prisma.masterUser.update({
      where: { id },
      data: dto,
    });

    return {
      data: {
        id: updatedOwner.id,
        name: updatedOwner.name,
        email: updatedOwner.email,
        active: updatedOwner.active,
      },
    };
  }

  /**
   * Ativa/desativa owner
   */
  async toggleActive(id: string) {
    const owner = await prisma.masterUser.findUnique({
      where: { id },
    });

    if (!owner) {
      throw new NotFoundException('Owner não encontrado');
    }

    const updatedOwner = await prisma.masterUser.update({
      where: { id },
      data: { active: !owner.active },
    });

    return {
      success: true,
      message: `Owner ${updatedOwner.active ? 'ativado' : 'desativado'} com sucesso`,
      data: {
        id: updatedOwner.id,
        name: updatedOwner.name,
        email: updatedOwner.email,
        active: updatedOwner.active,
      },
    };
  }

  /**
   * Remove owner
   */
  async remove(id: string) {
    const owner = await prisma.masterUser.findUnique({
      where: { id },
    });

    if (!owner) {
      throw new NotFoundException('Owner não encontrado');
    }

    await prisma.masterUser.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Owner removido com sucesso',
    };
  }
}
