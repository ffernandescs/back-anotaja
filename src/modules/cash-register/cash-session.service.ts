import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCashSessionDto, ShiftType } from './dto/create-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateCashMovementDto } from './dto/cash-movement.dto';
import { prisma } from '../../../lib/prisma';
import {
  CashMovementType,
  CashSessionStatus as PrismaCashSessionStatus,
  ShiftType as PrismaShiftType,
} from '@prisma/client';
import { formatCurrency } from '../../utils/formatCurrency';
import { CashRegisterNotOpenException } from '../../common/exceptions/cash-register.exception';
import { computeCashSessionBalance } from 'src/utils/computeCashSessionBalance';
// ✅ Reutiliza o Gateway único do projeto — sem criar um segundo WebSocketGateway
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway'; // ajuste o path se necessário

// ─── Include padrão ────────────────────────────────────────────────────────────
const cashSessionInclude = {
  openedByUser: { select: { id: true, name: true } },
  closedByUser: { select: { id: true, name: true } },
  movements: {
    include: {
      user: { select: { id: true, name: true } },
      order: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  branch: { select: { id: true, branchName: true } },
};

function serializeSession(session: any) {
  return {
    ...session,
    openedByName: session.openedByUser?.name ?? session.openedByName ?? null,
    closedByName: session.closedByUser?.name ?? session.closedByName ?? null,
  };
}

@Injectable()
export class CashSessionService {
  // ✅ Injeta o Gateway já existente (não há segundo servidor WS)
  constructor(private readonly wsGateway: OrdersWebSocketGateway) {}

  // ─── ABERTURA ────────────────────────────────────────────────────────────────
  async openCashSession(createCashSessionDto: CreateCashSessionDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId) throw new NotFoundException('Filial não encontrada');

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

    const lastClosedSession = await prisma.cashSession.findFirst({
      where: { branchId: user.branchId, status: PrismaCashSessionStatus.CLOSED },
      orderBy: { closedAt: 'desc' },
    });

    const previousBalance = lastClosedSession?.closingAmount ?? 0;
    const openingAmount = previousBalance + createCashSessionDto.openingAmount;

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
        type: CashMovementType.OPENING,
        amount: openingAmount,
        userId,
        paymentMethod: 'CASH',
        description: `Abertura de caixa${previousBalance > 0 ? ` (inclui saldo anterior de ${formatCurrency(previousBalance)})` : ''}`,
      },
    });

    return serializeSession(cashSession);
  }

  // ─── LISTAR ──────────────────────────────────────────────────────────────────
  async findAllCashSessions(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, branchId: true },
    });

    if (!user?.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const sessions = await prisma.cashSession.findMany({
      where: { branchId: user.branchId, status: PrismaCashSessionStatus.OPEN },
      include: { openedByUser: { select: { id: true, name: true } } },
      orderBy: { openedAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      openedAt: s.openedAt,
      openedBy: s.openedBy,
      openedByName: s.openedByUser?.name ?? null,
      status: s.status,
      openingAmount: s.openingAmount,
    }));
  }

  // ─── BUSCAR POR ID ────────────────────────────────────────────────────────────
  async findCashSessionById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        companyId: true,
        branchId: true,
        group: { select: { permissions: true } },
      },
    });

    if (!user?.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const canViewAll = user.group?.permissions?.some(
      (p) => p.subject === 'cash_register' && p.action === 'manage',
    );

    const cashSession = await prisma.cashSession.findFirst({
      where: canViewAll
        ? { branchId: user.branchId, status: PrismaCashSessionStatus.OPEN }
        : { branchId: user.branchId, openedBy: userId, status: PrismaCashSessionStatus.OPEN },
      orderBy: { openedAt: 'desc' },
      include: cashSessionInclude,
    });

    if (!cashSession) throw new NotFoundException('Nenhum caixa ativo encontrado');
    return serializeSession(cashSession);
  }

  // ─── SALDO ESPERADO ───────────────────────────────────────────────────────────
  async calculateExpectedBalance(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, branchId: true },
    });

    if (!user?.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    let isFallback = false;

    let cashSession = await prisma.cashSession.findFirst({
      where: { branchId: user.branchId, openedBy: userId, status: PrismaCashSessionStatus.OPEN },
      include: {
        openedByUser: { select: { id: true, name: true } },
        movements: {
          include: {
            user: { select: { id: true, name: true } },
            order: { select: { orderNumber: true } },
          },
        },
      },
    });

    if (!cashSession) {
      isFallback = true;
      cashSession = await prisma.cashSession.findFirst({
        where: { branchId: user.branchId, openedBy: userId, status: PrismaCashSessionStatus.CLOSED },
        orderBy: { closedAt: 'desc' },
        include: {
          openedByUser: { select: { id: true, name: true } },
          movements: {
            include: {
              user: { select: { id: true, name: true } },
              order: { select: { orderNumber: true } },
            },
          },
        },
      });

      if (!cashSession) throw new CashRegisterNotOpenException();
    }

    const calc = computeCashSessionBalance(cashSession);

    const otherOpenSessionsRaw = await prisma.cashSession.findMany({
      where: {
        branchId: user.branchId,
        status: PrismaCashSessionStatus.OPEN,
        NOT: { id: cashSession.id },
      },
      include: {
        movements: true,
        openedByUser: { select: { id: true, name: true } },
      },
    });

    const otherOpenSessions = otherOpenSessionsRaw.map((s) => {
      const c = computeCashSessionBalance(s);
      return {
        id: s.id,
        openedAt: s.openedAt,
        openedBy: s.openedBy,
        openedByName: s.openedByUser?.name ?? null,
        openingAmount: s.openingAmount,
        status: s.status,
        cashBalance: c.expectedAmount,
      };
    });

    return {
      cashSessionId: cashSession.id,
      status: cashSession.status,
      isFallback,
      openedAt: cashSession.openedAt,
      closedAt: cashSession.closedAt ?? null,
      openedBy: cashSession.openedBy,
      openedByName: cashSession.openedByUser?.name ?? null,
      openingAmount: cashSession.openingAmount,
      closingAmount: cashSession.closingAmount ?? null,
      ...calc,
      balance: {
        cash: calc.expectedAmount,
        credit: calc.salesByCredit,
        debit: calc.salesByDebit,
        pix: calc.salesByPix,
        online: calc.salesByOnline,
        total:
          calc.expectedAmount + calc.salesByCredit + calc.salesByDebit +
          calc.salesByPix + calc.salesByOnline,
      },
      movements: (cashSession.movements ?? []).map((m) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        description: m.description,
        paymentMethod: m.paymentMethod,
        orderId: m.orderId,
        orderNumber: (m.order as any)?.orderNumber ?? null,
        createdAt: m.createdAt,
        user: m.user ? { id: m.user.id, name: m.user.name } : null,
      })),
      otherOpenSessions,
    };
  }

  // ─── FECHAMENTO ──────────────────────────────────────────────────────────────
  async closeCashSession(id: string, closeCashDto: CloseCashSessionDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user?.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const cashSession = await prisma.cashSession.findUnique({
      where: { id, branchId: user.branchId, openedBy: userId, status: PrismaCashSessionStatus.OPEN },
      include: { movements: true },
    });

    if (!cashSession) throw new NotFoundException('Sessão de caixa aberta não encontrada');

    await prisma.cashSession.update({ where: { id }, data: { status: PrismaCashSessionStatus.CLOSING } });

    let expectedAmount = cashSession.openingAmount;
    for (const movement of cashSession.movements ?? []) {
      if (movement.type === CashMovementType.SALE && (movement.paymentMethod as string)?.toUpperCase() === 'CASH') {
        expectedAmount += movement.amount;
      } else if (movement.type === CashMovementType.DEPOSIT) {
        expectedAmount += movement.amount;
      } else if (movement.type === CashMovementType.WITHDRAWAL) {
        expectedAmount -= movement.amount;
      }
    }

    const withdrawalAmount = closeCashDto.closingAmount;

    if (withdrawalAmount > expectedAmount) {
      await prisma.cashSession.update({ where: { id }, data: { status: PrismaCashSessionStatus.OPEN } });
      throw new BadRequestException(
        `Não é possível retirar ${formatCurrency(withdrawalAmount)}. Saldo disponível: ${formatCurrency(expectedAmount)}`,
      );
    }

    const remainingAmount = expectedAmount - withdrawalAmount;
    const difference = remainingAmount - expectedAmount;

    const updatedCashSession = await prisma.cashSession.update({
      where: { id },
      data: {
        status: PrismaCashSessionStatus.CLOSED,
        closedAt: new Date(),
        closedBy: userId,
        closingAmount: remainingAmount,
        expectedAmount,
        difference,
        notes: closeCashDto.notes,
      },
      include: cashSessionInclude,
    });

    return serializeSession(updatedCashSession);
  }

  // ─── ADICIONAR MOVIMENTO ──────────────────────────────────────────────────────
  async addCashMovement(userId: string, payload: CreateCashMovementDto, targetSessionId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user?.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    if (payload.type === CashMovementType.TRANSFER) {
      if (!targetSessionId) throw new BadRequestException('Transferência requer caixa de destino');
      return this.handleTransfer(userId, payload, targetSessionId);
    }

    const openCashSession = await prisma.cashSession.findFirst({
      where: { branchId: user.branchId, openedBy: userId, status: PrismaCashSessionStatus.OPEN },
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

  // ─── TRANSFERÊNCIA ENTRE CAIXAS ───────────────────────────────────────────────

private async handleTransfer(
  fromUserId: string,
  payload: CreateCashMovementDto,
  targetSessionId: string,
) {
  const fromUser = await prisma.user.findUnique({
    where: { id: fromUserId },
    select: { id: true, name: true, branchId: true },
  });

  if (!fromUser?.branchId)
    throw new ForbiddenException('Usuário não está associado a uma filial');

  const sourceSession = await prisma.cashSession.findFirst({
    where: {
      branchId: fromUser.branchId,
      openedBy: fromUserId,
      status: PrismaCashSessionStatus.OPEN,
    },
  });

  const targetSession = await prisma.cashSession.findUnique({
    where: { id: targetSessionId },
    include: {
      openedByUser: { select: { id: true, name: true } },
    },
  });

  if (!sourceSession || !targetSession)
    throw new NotFoundException('Caixas de origem/destino não encontrados');

  if (sourceSession.branchId !== targetSession.branchId)
    throw new BadRequestException('Transferência só permitida entre caixas da mesma filial');

  const balance = await this.calculateExpectedBalance(fromUserId);

  if (payload.amount > balance.balance.cash) {
    throw new BadRequestException(
      `Saldo insuficiente para transferência. Disponível: ${formatCurrency(balance.balance.cash)}`,
    );
  }

  // ─────────────────────────────────────────────
  // 🔥 DESCRIÇÃO PADRÃO MELHORADA
  // ─────────────────────────────────────────────
  const baseDescription =
    payload.description?.trim() ||
    `Transferência entre caixas`;

  const transferDescriptionSource = `${baseDescription} - SAÍDA para caixa de ${targetSession.openedByUser?.name ?? targetSession.id}`;
  const transferDescriptionTarget = `${baseDescription} - ENTRADA vinda de ${fromUser.name ?? fromUserId}`;

  await prisma.$transaction([
    // 🟥 SAÍDA (SANGRIA)
    prisma.cashMovement.create({
      data: {
        cashSessionId: sourceSession.id,
        type: CashMovementType.WITHDRAWAL,
        amount: payload.amount,
        userId: fromUserId,
        paymentMethod: 'CASH',
        description: transferDescriptionSource,
      },
    }),

    // 🟩 ENTRADA (SUPRIMENTO)
    prisma.cashMovement.create({
      data: {
        cashSessionId: targetSession.id,
        type: CashMovementType.DEPOSIT,
        amount: payload.amount,
        userId: fromUserId,
        paymentMethod: 'CASH',
        description: transferDescriptionTarget,
      },
    }),
  ]);

  const timestamp = new Date().toISOString();
    const toUserId = targetSession.openedBy;

    // 2. WebSocket → destinatário
    // Room `user:<id>` já existe pelo handleConnection() do OrdersWebSocketGateway
    if (toUserId) {
      this.wsGateway.emitCashTransferReceived(toUserId, {
        cashSessionId: targetSession.id,
        fromUserId,
        fromUserName: fromUser.name ?? null,
        amount: payload.amount,
        description: payload.description,
        timestamp,
      });
    }

    // 3. WebSocket → remetente (confirma saída)
    this.wsGateway.emitCashTransferSent(fromUserId, {
      cashSessionId: sourceSession.id,
      toUserId: toUserId ?? '',
      toUserName: targetSession.openedByUser?.name ?? null,
      amount: payload.amount,
      description: payload.description,
      timestamp,
    });

  return {
    success: true,
    message: 'Transferência realizada com sucesso',
  };
}

  // ─── ÚLTIMA SESSÃO FECHADA ────────────────────────────────────────────────────
  async findLastClosedByBranch(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user?.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const lastClosedSession = await prisma.cashSession.findFirst({
      where: { branchId: user.branchId, status: PrismaCashSessionStatus.CLOSED },
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