import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCashSessionDto, CashSessionStatus, ShiftType } from './dto/create-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateCashMovementDto } from './dto/cash-movement.dto';
import { prisma } from '../../../lib/prisma';
import { CashMovementType, CashSessionStatus as PrismaCashSessionStatus, ShiftType as PrismaShiftType } from '@prisma/client';
import { PaymentMethodTypeDto } from '../branches/dto/create-branch.dto';
import { formatCurrency } from '../../utils/formatCurrency';
import { CashRegisterNotOpenException } from '../../common/exceptions/cash-register.exception';

// ─── Include padrão com operadores ───────────────────────────────────────────
// Reutilizado em todos os métodos para garantir consistência no retorno do nome
const cashSessionInclude = {
  openedByUser: {
    select: { id: true, name: true },
  },
  closedByUser: {
    select: { id: true, name: true },
  },
  movements: {
    include: {
      user: {
        select: { id: true, name: true },
      },
      order: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  branch: {
    select: { id: true, branchName: true },
  },
};

// ─── Helper: serializa sessão adicionando campos de nome flat ────────────────
// Garante que openedByName e closedByName sempre existam no retorno,
// independente de qual relação o Prisma retornar
function serializeSession(session: any) {
  return {
    ...session,
    openedByName: session.openedByUser?.name ?? session.openedByName ?? null,
    closedByName: session.closedByUser?.name ?? session.closedByName ?? null,
  };
}

@Injectable()
export class CashSessionService {
  /**
   * ABERTURA DE CAIXA
   *
   * Regras:
   * 1. Um usuário só pode ter 1 caixa OPEN por vez na mesma filial
   * 2. openingAmount = closingAmount do último CLOSED da filial + valor informado
   * 3. Múltiplos usuários podem ter caixas abertos simultaneamente na mesma filial
   */
  async openCashSession(createCashSessionDto: CreateCashSessionDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId) throw new NotFoundException('Filial não encontrada');

    // 1. Verificar se já existe caixa aberto para o usuário na filial
    const existingOpenSession = await prisma.cashSession.findFirst({
      where: {
        branchId: user.branchId,
        openedBy: userId,
        status: PrismaCashSessionStatus.OPEN,
      },
    });

    if (existingOpenSession) {
      throw new BadRequestException('Você já possui um caixa aberto nesta filial');
    }

    // 2. Buscar o último caixa fechado da filial (não apenas do usuário)
    const lastClosedSession = await prisma.cashSession.findFirst({
      where: {
        branchId: user.branchId,
        status: PrismaCashSessionStatus.CLOSED,
      },
      orderBy: { closedAt: 'desc' },
    });

    // 3. Saldo que ficou do último fechamento (o que NÃO foi retirado)
    const previousBalance = lastClosedSession?.closingAmount ?? 0;

    // 4. Total no caixa = saldo anterior + valor que o operador está colocando agora
    const openingAmount = previousBalance + createCashSessionDto.openingAmount;

    // 5. Criar a sessão
    const cashSession = await prisma.cashSession.create({
      data: {
        branchId: user.branchId,
        openedBy: userId,
        status: PrismaCashSessionStatus.OPEN,
        shiftType: (createCashSessionDto.shiftType as PrismaShiftType) || PrismaShiftType.CUSTOM,
        openingAmount,
        notes: createCashSessionDto.notes,
      },
      include: cashSessionInclude,
    });

    await prisma.cashMovement.create({
      data: {
        cashSessionId: cashSession.id,
        type: CashMovementType.OPENING,   // ou OPENING se existir no enum
        amount: openingAmount,
        userId,
        paymentMethod: 'CASH',
        description: `Abertura de caixa${previousBalance > 0 ? ` (inclui saldo anterior de ${formatCurrency(previousBalance)})` : ''}`,
      },
    });

    return serializeSession(cashSession);
  }

  /**
   * LISTAR SESSÕES DE CAIXA
   *
   * Operador comum: vê apenas o próprio CashSession
   * Supervisor/gerente (scope = BRANCH): vê todos os caixas da filial
   * 
   * @param includeAll Se true, retorna todos os caixas (usado em transferências)
   */
  async findAllCashSessions(userId: string, includeAll = false) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        group: { include: { permissions: true } },
      },
    });

    if (!user || !user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    // Verificar se usuário é supervisor/gerente OU se includeAll=true
    const canViewAllSessions = includeAll || user.group?.permissions.some(
      (p) => p.subject === 'cash_register' && p.action === 'manage',
    );

    console.log(user.group?.permissions,'user.group?.permissions')


    const whereClause = canViewAllSessions
      ? { branchId: user.branchId }
      : { branchId: user.branchId, openedBy: userId };

    const sessions = await prisma.cashSession.findMany({
      where: whereClause,
      include: cashSessionInclude,
      orderBy: { openedAt: 'desc' },
    });

    return sessions.map(serializeSession);
  }

  /**
   * BUSCAR UMA SESSÃO DE CAIXA
   */
  async findCashSessionById(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        group: { include: { permissions: true } },
      },
    });

    if (!user || !user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const canViewAllSessions = user.group?.permissions.some(
      (p) => p.subject === 'cash_register' && p.action === 'manage',
    );

    console.log(canViewAllSessions,'canViewAllSessions')
        console.log(id,'id')
        console.log(user.branchId,'user.branchId')

    const whereClause = canViewAllSessions
      ? { id, branchId: user.branchId }
      : { id, branchId: user.branchId, openedBy: user.id };

    const cashSession = await prisma.cashSession.findFirst({
      where: whereClause,
      include: cashSessionInclude,
    });

    if (!cashSession) throw new NotFoundException('Sessão de caixa não encontrada');

    return serializeSession(cashSession);
  }

  /**
   * CALCULAR SALDO ESPERADO EM TEMPO REAL
   *
   * expectedAmount = openingAmount
   *                + SUM(SALE em CASH)
   *                + SUM(DEPOSIT)
   *                - SUM(WITHDRAWAL)
   */
    async calculateExpectedBalance(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const openCashSession = await prisma.cashSession.findFirst({
      where: {
        branchId: user.branchId,
        openedBy: userId,
        status: PrismaCashSessionStatus.OPEN,
      },
      include: {
        openedByUser: { select: { id: true, name: true } },
        movements: {
          include: {
            order: { select: { orderNumber: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!openCashSession) throw new CashRegisterNotOpenException();

    // openingAmount já é a fonte da verdade para o saldo inicial.
    // O movimento de tipo OPENING é apenas para exibição no histórico —
    // NÃO deve ser somado aqui, pois já está contabilizado neste campo.
    let expectedAmount = openCashSession.openingAmount;
    let totalSales = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let salesByCash = 0;
    let salesByCredit = 0;
    let salesByDebit = 0;
    let salesByPix = 0;
    let salesByOnline = 0;

    for (const movement of openCashSession.movements ?? []) {
      // OPENING: ignorado intencionalmente — valor já está em openingAmount
      if (movement.type === CashMovementType.OPENING) {
        continue;
      }

      if (movement.type === CashMovementType.SALE) {
        totalSales += movement.amount;
        const method = (movement.paymentMethod as string)?.toUpperCase() ?? '';

        switch (method) {
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
        }
      } else if (movement.type === CashMovementType.DEPOSIT) {
        // Apenas depósitos manuais feitos APÓS a abertura somam aqui
        totalDeposits += movement.amount;
        expectedAmount += movement.amount;
      } else if (movement.type === CashMovementType.WITHDRAWAL) {
        totalWithdrawals += movement.amount;
        expectedAmount -= movement.amount;
      }
    }

    const openedByName = openCashSession.openedByUser?.name ?? null;

    return {
      cashSessionId: openCashSession.id,
      status: openCashSession.status,
      openedAt: openCashSession.openedAt,
      openingDate: openCashSession.openedAt,
      openedBy: openCashSession.openedBy,
      openedByName,
      openingAmount: openCashSession.openingAmount,
      expectedAmount,
      totalSales,
      salesByCash,
      salesByCredit,
      salesByDebit,
      salesByPix,
      salesByOnline,
      totalDeposits,
      totalWithdrawals,
      balance: {
        cash: expectedAmount,
        credit: salesByCredit,
        debit: salesByDebit,
        pix: salesByPix,
        online: salesByOnline,
        total: expectedAmount + salesByCredit + salesByDebit + salesByPix + salesByOnline,
      },
      openingNotes: openCashSession.notes,
      shiftType: openCashSession.shiftType,
      movements: (openCashSession.movements ?? []).map((m: any) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        description: m.description,
        paymentMethod: m.paymentMethod,
        orderId: m.orderId,
        orderNumber: m.order?.orderNumber ?? null,
        createdAt: m.createdAt,
        user: m.user ? { id: m.user.id, name: m.user.name } : null,
      })),
    };
  }


  /**
   * FECHAMENTO DE CAIXA
   *
   * O operador informa QUANTO QUER RETIRAR (withdrawalAmount).
   * O que FICA no caixa = expectedAmount - withdrawalAmount.
   * Esse saldo restante será somado na próxima abertura.
   *
   * closingAmount salvo no banco = o que FICA (não o que foi retirado).
   */
  async closeCashSession(id: string, closeCashDto: CloseCashSessionDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    // 1. Buscar o caixa aberto
    const cashSession = await prisma.cashSession.findUnique({
      where: {
        id,
        branchId: user.branchId,
        openedBy: userId,
        status: PrismaCashSessionStatus.OPEN,
      },
      include: { movements: true },
    });

    if (!cashSession) throw new NotFoundException('Sessão de caixa aberta não encontrada');

    // 2. Mudar status para CLOSING (conferência intermediária)
    await prisma.cashSession.update({
      where: { id },
      data: { status: PrismaCashSessionStatus.CLOSING },
    });

    // 3. Calcular o valor esperado em dinheiro físico
    let expectedAmount = cashSession.openingAmount;

    for (const movement of cashSession.movements ?? []) {
      if (
        movement.type === CashMovementType.SALE &&
        (movement.paymentMethod as string)?.toUpperCase() === 'CASH'
      ) {
        expectedAmount += movement.amount;
      } else if (movement.type === CashMovementType.DEPOSIT) {
        expectedAmount += movement.amount;
      } else if (movement.type === CashMovementType.WITHDRAWAL) {
        expectedAmount -= movement.amount;
      }
    }

    // 4. O DTO traz quanto o operador quer RETIRAR
    const withdrawalAmount = closeCashDto.closingAmount; // quanto sai

    // Validar que não retira mais do que existe
    if (withdrawalAmount > expectedAmount) {
      // Reverter CLOSING → OPEN antes de lançar o erro
      await prisma.cashSession.update({
        where: { id },
        data: { status: PrismaCashSessionStatus.OPEN },
      });
      throw new BadRequestException(
        `Não é possível retirar ${formatCurrency(withdrawalAmount)}. ` +
        `Saldo disponível: ${formatCurrency(expectedAmount)}`,
      );
    }

    // 5. O que FICA no caixa (será somado na próxima abertura)
    const remainingAmount = expectedAmount - withdrawalAmount;

    // 6. Diferença entre esperado e o que ficou (para auditoria)
    const difference = remainingAmount - expectedAmount; // sempre = -withdrawalAmount

    // 7. Fechar definitivamente
    const updatedCashSession = await prisma.cashSession.update({
      where: { id },
      data: {
        status: PrismaCashSessionStatus.CLOSED,
        closedAt: new Date(),
        closedBy: userId,
        closingAmount: remainingAmount,   // ← O QUE FICA (passa para próxima abertura)
        expectedAmount,                   // ← O que deveria ter
        difference,
        notes: closeCashDto.notes,
      },
      include: cashSessionInclude,
    });

    return serializeSession(updatedCashSession);
  }

  /**
   * ADICIONAR MOVIMENTO DE CAIXA
   */
  async addCashMovement(
    userId: string,
    payload: CreateCashMovementDto,
    targetSessionId?: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    if (payload.type === CashMovementType.TRANSFER) {
      if (!targetSessionId)
        throw new BadRequestException('Transferência requer caixa de destino');
      return this.handleTransfer(userId, payload, targetSessionId);
    }

    const openCashSession = await prisma.cashSession.findFirst({
      where: {
        branchId: user.branchId,
        openedBy: userId,
        status: PrismaCashSessionStatus.OPEN,
      },
    });

    if (!openCashSession) throw new CashRegisterNotOpenException();

    if (payload.type === CashMovementType.WITHDRAWAL && !payload.description) {
      throw new BadRequestException('Sangria (WITHDRAWAL) exige descrição/motivo');
    }

    if (payload.type === CashMovementType.WITHDRAWAL) {
      const balance = await this.calculateExpectedBalance(userId);
      if (payload.amount > balance.balance.cash) {
        throw new BadRequestException(
          `Saldo insuficiente em caixa para sangria. Disponível: ${formatCurrency(balance.balance.cash)}`,
        );
      }
    }

    await prisma.cashMovement.create({
      data: {
        cashSessionId: openCashSession.id,
        type: payload.type,
        amount: payload.amount,
        userId,
        paymentMethod: (payload.paymentMethod as any) || 'CASH',
        description: payload.description || this.getDefaultDescription(payload.type),
        orderId: payload.orderId,
      },
    });

    return this.calculateExpectedBalance(userId);
  }

  /**
   * TRANSFERÊNCIA ENTRE CAIXAS
   */
  private async handleTransfer(
    userId: string,
    payload: CreateCashMovementDto,
    targetSessionId: string,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    const sourceSession = await prisma.cashSession.findFirst({
      where: {
        branchId: user?.branchId!,
        openedBy: userId,
        status: PrismaCashSessionStatus.OPEN,
      },
    });

    const targetSession = await prisma.cashSession.findUnique({
      where: { id: targetSessionId },
    });

    if (!sourceSession || !targetSession)
      throw new NotFoundException('Caixas de origem/destino não encontrados');

    if (sourceSession.branchId !== targetSession.branchId)
      throw new BadRequestException('Transferência só permitida entre caixas da mesma filial');

    const balance = await this.calculateExpectedBalance(userId);
    if (payload.amount > balance.balance.cash) {
      throw new BadRequestException(
        `Saldo insuficiente para transferência. Disponível: ${formatCurrency(balance.balance.cash)}`,
      );
    }

    await prisma.$transaction([
      prisma.cashMovement.create({
        data: {
          cashSessionId: sourceSession.id,
          type: CashMovementType.WITHDRAWAL,
          amount: payload.amount,
          userId,
          paymentMethod: 'CASH',
          description: `Transferência para caixa ${targetSessionId}`,
        },
      }),
      prisma.cashMovement.create({
        data: {
          cashSessionId: targetSession.id,
          type: CashMovementType.DEPOSIT,
          amount: payload.amount,
          userId,
          paymentMethod: 'CASH',
          description: `Transferência do caixa ${sourceSession.id}`,
        },
      }),
    ]);

    return { success: true, message: 'Transferência realizada com sucesso' };
  }

  /**
   * BUSCAR ÚLTIMA SESSÃO FECHADA DA FILIAL
   */
  async findLastClosedByBranch(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const lastClosedSession = await prisma.cashSession.findFirst({
      where: {
        branchId: user.branchId,
        status: PrismaCashSessionStatus.CLOSED,
      },
      orderBy: { closedAt: 'desc' },
      include: {
        openedByUser: { select: { id: true, name: true } },
        closedByUser: { select: { id: true, name: true } },
      },
    });

    if (!lastClosedSession) return null;
    return serializeSession(lastClosedSession);
  }

  private getDefaultDescription(type: CashMovementType): string {
    switch (type) {
      case CashMovementType.DEPOSIT:    return 'Depósito em caixa';
      case CashMovementType.WITHDRAWAL: return 'Sangria';
      case CashMovementType.SALE:       return 'Venda';
      case CashMovementType.TRANSFER:   return 'Transferência';
      case CashMovementType.ADJUSTMENT: return 'Ajuste administrativo';
      default:                          return 'Movimentação de caixa';
    }
  }
}