import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';
import { prisma } from '../../../lib/prisma';
import { CashMovementType } from 'generated/prisma';
import { PaymentMethodTypeDto } from '../branches/dto/create-branch.dto';

@Injectable()
export class CashRegisterService {
  /**
   * ABERTURA DE CAIXA
   *
   * Regras:
   * 1. Verificar se já existe caixa aberto para o usuário
   * 2. Buscar o último caixa FECHADO do mesmo usuário
   * 3. openingAmount = closingAmount_anterior + valor_informado
   * 4. expectedAmount = closingAmount_anterior (saldo que ficou)
   */
  async create(createCashRegisterDto: CreateCashRegisterDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // 1. Verificar se já existe caixa aberto
    const existingOpenCash = await prisma.cashRegister.findFirst({
      where: {
        branchId: user.branchId,
        openedBy: userId,
        status: CashMovementType.OPENING,
      },
    });

    if (existingOpenCash) {
      throw new BadRequestException('Você já possui um caixa aberto');
    }

    // 2. Buscar o último caixa fechado do usuário
    const lastClosedCashRegister = await prisma.cashRegister.findFirst({
      where: {
        branchId: user.branchId,
        openedBy: userId,
        status: CashMovementType.CLOSING,
      },
      orderBy: { closingDate: 'desc' },
    });

    // 3. Calcular saldo anterior (quanto ficou do último fechamento)
    const previousBalance = lastClosedCashRegister?.closingAmount ?? 0;

    // 4. Calcular opening amount (saldo anterior + valor informado)
    const openingAmount = previousBalance + createCashRegisterDto.openingAmount;

    // 5. Criar o caixa
    const cashRegister = await prisma.cashRegister.create({
      data: {
        branchId: user.branchId,
        openedBy: userId,
        status: CashMovementType.OPENING,
        openingAmount: openingAmount,
        expectedAmount: previousBalance, // Quanto estava disponível antes da abertura
        notes: createCashRegisterDto.notes,
      },
      include: {
        movements: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
            order: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    // 6. Registrar movimento de abertura
    await prisma.cashMovement.create({
      data: {
        cashRegisterId: cashRegister.id,
        type: CashMovementType.OPENING,
        amount: createCashRegisterDto.openingAmount,
        userId: userId,
        paymentMethod: PaymentMethodTypeDto.CASH,
        description: createCashRegisterDto.notes || 'Abertura de caixa',
      },
    });

    return cashRegister;
  }

  /**
   * LISTAR CAIXAS
   *
   * Retorna todos os caixas do usuário logado
   */
  async findAll(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    return prisma.cashRegister.findMany({
      where: {
        branchId: user.branchId,
        openedBy: userId,
      },
      include: {
        movements: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
            order: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        openingDate: 'desc',
      },
    });
  }

  /**
   * BUSCAR UM CAIXA
   */
  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    const cashRegister = await prisma.cashRegister.findUnique({
      where: {
        id,
        branchId: user.branchId,
        openedBy: userId,
      },
      include: {
        movements: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
            order: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!cashRegister) {
      throw new NotFoundException('Caixa não encontrado');
    }

    return cashRegister;
  }

  /**
   * CALCULAR SALDO ESPERADO EM TEMPO REAL
   *
   * Retorna o valor esperado do caixa aberto considerando todas as movimentações
   */
  async calculateExpectedBalance(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Buscar o caixa aberto do usuário
    const openCashRegister = await prisma.cashRegister.findFirst({
      where: {
        branchId: user.branchId,
        openedBy: userId,
        status: CashMovementType.OPENING,
      },
      include: {
        movements: true,
      },
    });

    if (!openCashRegister) {
      throw new NotFoundException('Nenhum caixa aberto encontrado');
    }

    // Calcular o valor esperado
    let expectedAmount = openCashRegister.openingAmount;
    let totalSales = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let salesByCash = 0;
    let salesByCredit = 0;
    let salesByDebit = 0;
    let salesByPix = 0;
    let salesByOnline = 0;

    if (openCashRegister.movements && openCashRegister.movements.length > 0) {
      openCashRegister.movements.forEach((movement: any) => {
        // Vendas em DINHEIRO aumentam o caixa físico
        if (movement.type === CashMovementType.SALE) {
          totalSales += movement.amount;

          const method = typeof movement.paymentMethod === 'string'
            ? movement.paymentMethod
            : (movement.paymentMethod as any)?.toString() || '';

          const normalized = method.toUpperCase();

          switch (normalized) {
            case 'CASH':
              salesByCash += movement.amount;
              expectedAmount += movement.amount;
              break;
            case 'CREDIT':
            case 'CREDIT_CARD':
              salesByCredit += movement.amount;
              break;
            case 'DEBIT':
            case 'DEBIT_CARD':
              salesByDebit += movement.amount;
              break;
            case 'PIX':
              salesByPix += movement.amount;
              break;
            case 'ONLINE':
              salesByOnline += movement.amount;
              break;
            default:
              // fallback: não impacta caixa físico
              break;
          }
        }
        // Depósitos aumentam o caixa
        else if (movement.type === CashMovementType.DEPOSIT) {
          totalDeposits += movement.amount;
          expectedAmount += movement.amount;
        }
        // Sangrias diminuem o caixa
        else if (movement.type === CashMovementType.WITHDRAWAL) {
          totalWithdrawals += movement.amount;
          expectedAmount -= movement.amount;
        }
      });
    }

    return {
      cashRegisterId: openCashRegister.id,
      openingAmount: openCashRegister.openingAmount,
      expectedAmount: expectedAmount, // Valor total esperado em dinheiro
      totalSales: totalSales,
      salesByCash: salesByCash,
      salesByCredit: salesByCredit,
      salesByDebit: salesByDebit,
      salesByPix: salesByPix,
      salesByOnline: salesByOnline,
      totalDeposits: totalDeposits,
      totalWithdrawals: totalWithdrawals,
      balance: {
        cash: expectedAmount,
        credit: salesByCredit,
        debit: salesByDebit,
        pix: salesByPix,
        online: salesByOnline,
        total:
          expectedAmount +
          salesByCredit +
          salesByDebit +
          salesByPix +
          salesByOnline,
      },
    };
  }

  /**
   * FECHAMENTO DE CAIXA
   *
   * Regras:
   * 1. Buscar o caixa aberto do usuário
   * 2. Calcular expectedAmount (saldo esperado):
   *    expectedAmount = openingAmount + vendas_dinheiro + depósitos - sangrias
   * 3. Usuário informa withdrawAmount (quanto vai retirar)
   * 4. closingAmount = expectedAmount - withdrawAmount (quanto fica)
   * 5. difference = closingAmount - expectedAmount (geralmente será negativo pela retirada)
   */
  async closedCashRegister(
    id: string,
    closeCashDto: { closingAmount: number; notes: string },
    userId: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // 1. Buscar o caixa aberto
    const cashRegister = await prisma.cashRegister.findUnique({
      where: {
        id,
        branchId: user.branchId,
        openedBy: userId,
        status: CashMovementType.OPENING,
      },
      include: {
        movements: true,
      },
    });

    if (!cashRegister) {
      throw new NotFoundException('Caixa aberto não encontrado');
    }

    if (cashRegister.status !== CashMovementType.OPENING) {
      throw new BadRequestException('Caixa já está fechado');
    }

    // 2. Calcular o valor esperado (quanto deveria ter em dinheiro)
    let expectedAmount = cashRegister.openingAmount;

    if (cashRegister.movements && cashRegister.movements.length > 0) {
      cashRegister.movements.forEach((movement: any) => {
        // Vendas em DINHEIRO aumentam o caixa
        if (
          movement.type === CashMovementType.SALE &&
          movement.paymentMethod === 'CASH'
        ) {
          expectedAmount += movement.amount;
        }
        // Depósitos aumentam o caixa
        else if (movement.type === CashMovementType.DEPOSIT) {
          expectedAmount += movement.amount;
        }
        // Sangrias diminuem o caixa
        else if (movement.type === CashMovementType.WITHDRAWAL) {
          expectedAmount -= movement.amount;
        }
      });
    }

    // 3. O valor informado pelo usuário é o quanto ele vai RETIRAR (withdrawAmount)
    const withdrawAmount = closeCashDto.closingAmount;

    // Validação: não pode retirar mais do que tem
    if (withdrawAmount > expectedAmount) {
      throw new BadRequestException(
        `Não é possível retirar ${withdrawAmount}. Valor disponível em caixa: ${expectedAmount}`,
      );
    }

    // 4. Calcular quanto vai ficar no caixa
    const closingAmount = expectedAmount - withdrawAmount;

    // 5. Diferença (geralmente será negativa devido à retirada)
    const difference = closingAmount - expectedAmount;

    // 6. Atualizar o caixa
    const updatedCashRegister = await prisma.cashRegister.update({
      where: { id },
      data: {
        status: CashMovementType.CLOSING,
        closingDate: new Date(),
        closedBy: userId,
        closingAmount: closingAmount, // Quanto ficou
        expectedAmount: expectedAmount, // Quanto deveria ter
        difference: difference, // Diferença
        notes: closeCashDto.notes,
      },
      include: {
        movements: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
            order: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    // 7. Registrar movimento de fechamento (a retirada)
    await prisma.cashMovement.create({
      data: {
        cashRegisterId: cashRegister.id,
        type: CashMovementType.WITHDRAWAL,
        amount: withdrawAmount,
        userId: userId,
        paymentMethod: PaymentMethodTypeDto.CASH,
        description: closeCashDto.notes || 'Retirada no fechamento de caixa',
      },
    });

    return updatedCashRegister;
  }

  update(id: number, updateCashRegisterDto: UpdateCashRegisterDto) {
    return `This action updates a #${id} cashRegister`;
  }

  remove(id: number) {
    return `This action removes a #${id} cashRegister`;
  }
}
