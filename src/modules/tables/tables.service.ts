import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerType, Order, OrderChannel, OrderStatus, Prisma, ServiceType, TableSessionStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  BulkCreateTablesDto,
  CreateTableDto,
  MergeTablesDto,
  OpenTableDto,
  ReserveTableDto,
  RequestBillDto,
  TransferTableDto,
  UpdateTableDto,
} from './dto/index';
import {
  DeliveryTypeDto,
} from '../orders/dto/create-order-item.dto';
import { TableStatus } from './types';
import { money } from '../../utils/money';

@Injectable()
export class TablesService {
  constructor() {}

  /**
   * Busca todas as mesas de uma filial
   */
  async getTables(
    userId: string,
    includeMerged: boolean = false,
    status?: TableStatus,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId) throw new NotFoundException('Filial não encontrada');

    const whereCondition: Prisma.TableWhereInput = { branchId: user.branchId };

    if (!includeMerged) {
      whereCondition.status = { not: 'MERGED' };
    }

    if (status) {
      if (status === TableStatus.ALL) {
        delete whereCondition.status;
      } else {
        whereCondition.status = status;
      }
    }

    return prisma.table.findMany({
      where: whereCondition,
      include: {
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        orders: {
          where: {
            status: { in: ['IN_PROGRESS', 'PENDING', 'CONFIRMED', 'READY'] },
          },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            items: { include: { product: true } },
            payments: true,
            billSplit: true,
            billSplitPersons: true,
          },
        },
      },
      orderBy: { number: 'asc' },
    });
  }

  /**
   * Busca uma mesa específica por ID
   * Correção: usava user.id em vez de user.branchId
   */
  async getTableById(id: string, userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const table = await prisma.table.findUnique({
      where: { id, branchId: user.branchId ?? undefined },
      include: {
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        orders: {
          where: {
            status: { in: ['IN_PROGRESS', 'PENDING', 'CONFIRMED', 'READY'] },
          },
          include: {
            items: { include: { product: true } },
            customer: true,
            payments: true,
          },
        },
      },
    });

    if (!table) throw new NotFoundException('Mesa não encontrada');
    return table;
  }

  /**
   * Cria uma nova mesa
   */
  async createTable(data: CreateTableDto, userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId) throw new NotFoundException('Filial não encontrada');

    const existing = await prisma.table.findFirst({
      where: { branchId: user.branchId, number: data.number },
    });
    if (existing) throw new BadRequestException('Já existe uma mesa com este número');

    return prisma.table.create({
      data: {
        branchId: user.branchId,
        number: data.number,
        identification: data.identification,
        type: data.type ?? 'MESA',
        isActive: true,
        status: 'CLOSED',
        userId,
      },
    });
  }

  /**
   * Atualiza dados da mesa (número, identificação, tipo, etc.)
   * Correção: não cria mais pedido em toda atualização.
   * Só cria sessão + pedido quando status muda de CLOSED/AVAILABLE → OCCUPIED.
   */
  async updateTable(tableId: string, data: UpdateTableDto, userId: string) {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    if (data.number !== undefined && data.number !== table.number) {
      const existing = await prisma.table.findFirst({
        where: { branchId: table.branchId, number: data.number, id: { not: tableId } },
      });
      if (existing) throw new BadRequestException('Já existe uma mesa com este número');
    }

    const { number, identification, status, numberOfPeople, customerId, type, isActive } = data;

    // ─── Abertura de mesa: cria sessão + pedido ──────────────────────────────
    const isOpening =
      status === TableStatus.OCCUPIED &&
      ['CLOSED', 'AVAILABLE', 'CLEANING'].includes(table.status);

    if (isOpening) {
      return this._openTableWithSession({
        tableId,
        userId,
        numberOfPeople: numberOfPeople ?? 1,
        identification,
        customerId,
        orderData: data.order,
        type,
        isActive,
        number,
      });
    }

    // ─── Atualização simples (sem abrir) ─────────────────────────────────────
    return prisma.table.update({
      where: { id: tableId },
      data: {
        ...(number !== undefined ? { number } : {}),
        ...(identification !== undefined ? { identification } : {}),
        ...(status !== undefined && status !== TableStatus.ALL ? { status } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(numberOfPeople !== undefined ? { numberofpeople: numberOfPeople } : {}),
        ...(customerId !== undefined ? { customerId: customerId ?? null } : {}),
        userId,
      },
      include: { orders: true },
    });
  }

  /**
   * Remove uma mesa (só se estiver disponível e sem sessões ativas)
   */
  async deleteTable(tableId: string) {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Mesa não encontrada');
    if (!['CLOSED', 'AVAILABLE'].includes(table.status)) {
      throw new BadRequestException('Só é possível remover mesas disponíveis');
    }

    await prisma.table.delete({ where: { id: tableId } });
  }

  /**
   * Abre uma mesa via POST /tables/:id/open (endpoint legado)
   * Redireciona para a lógica de sessão centralizada
   */
  async openTable(tableId: string, data: OpenTableDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId) throw new ForbiddenException('Usuário não está associado a uma filial');

    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Mesa não encontrada');
    if (table.status === 'OCCUPIED' || table.status === 'OPEN') {
      throw new BadRequestException('Mesa já está ocupada');
    }

    // Validar produtos se foram enviados
    if (data.items?.length) {
      const productIds = data.items.map((i) => i.productId);
      const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
      if (products.length !== productIds.length) {
        throw new NotFoundException('Um ou mais produtos não foram encontrados');
      }
    }

    return this._openTableWithSession({
      tableId,
      userId,
      numberOfPeople: data.numberOfPeople,
      customerId: data.customerId,
      orderData: data,
    });
  }

  /**
   * ─── Lógica centralizada de abertura de mesa ─────────────────────────────
   * Cria TableSession + Order em uma transação, atualiza activeSessionId.
   */
  private async _openTableWithSession(params: {
    tableId: string;
    userId: string;
    numberOfPeople: number;
    identification?: string;
    customerId?: string;
    orderData?: any;
    type?: string;
    isActive?: boolean;
    number?: string;
  }) {
    const { tableId, userId, numberOfPeople, identification, customerId, orderData, type, isActive, number } = params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });
    if (!user?.branchId) throw new ForbiddenException('Usuário não está associado a uma filial');

    const lastOrder = await prisma.order.findFirst({
      where: { branchId: user.branchId },
      orderBy: { orderNumber: 'desc' },
    });
    const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar sessão
      const session = await tx.tableSession.create({
        data: {
          tableId,
          branchId: user.branchId!,
          openedBy: userId,
          numberOfPeople,
          identification: identification?.trim() || null,
          customerId: customerId ?? null,
          status: TableSessionStatus.OPEN,
        },
      });

      // 2. Criar pedido vinculado à sessão
      const order = await tx.order.create({
        data: {
          branchId: user.branchId!,
          orderNumber,
          status: OrderStatus.PENDING,
          deliveryType: orderData?.deliveryType ?? 'DINE_IN',
          paymentStatus: 'PENDING',
          paidAmount: 0,
          customerId: customerId ?? null,
          customerType: CustomerType.GUEST,
          serviceType: ServiceType.TABLE,
          channel: OrderChannel.PDV,
          tableId,
          tableSessionId: session.id,
          subtotal: money(orderData?.subtotal ?? 0),
          total: money(orderData?.total ?? 0),
          serviceFee: money(orderData?.serviceFee ?? 0),
          discount: money(orderData?.discount ?? 0),
          notes: orderData?.notes ?? null,
          couponId: orderData?.couponId ?? null,
          ...(orderData?.items?.length
            ? {
                items: {
                  create: orderData.items.map((item: any) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    price: money(item.price),
                    notes: item.notes ?? null,
                    preparationStatus: 'PENDING',
                    dispatchStatus: 'PENDING',
                    ...(item.additions?.length
                      ? { additions: { create: item.additions.map((a: any) => ({ additionId: a.additionId })) } }
                      : {}),
                    ...(item.complements?.length
                      ? {
                          complements: {
                            create: item.complements.map((c: any) => ({
                              complementId: c.complementId,
                              ...(c.options?.length
                                ? { options: { create: c.options.map((o: any) => ({ optionId: o.optionId })) } }
                                : {}),
                            })),
                          },
                        }
                      : {}),
                  })),
                },
              }
            : {}),
        },
      });

      // 3. Atualizar mesa: status + activeSessionId + dados denormalizados para display
      const updatedTable = await tx.table.update({
        where: { id: tableId },
        data: {
          status: 'OCCUPIED',
          numberofpeople: numberOfPeople,
          customerId: customerId ?? null,
          activeSessionId: session.id,
          userId,
          attendantId: userId,
          ...(number !== undefined ? { number } : {}),
          ...(identification !== undefined ? { identification: identification?.trim() || null } : {}),
          ...(type !== undefined ? { type: type as any } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
        include: { orders: true },
      });

      return { table: updatedTable, order, session };
    });

    return result;
  }

  /**
   * Fecha a sessão ativa da mesa e manda para CLEANING
   * Aceita mesas em OCCUPIED ou CLOSING
   * Se estiver em CLOSING, permite fechar mesmo com pedidos (desde que não estejam ativos)
   */
  async closeTable(tableId: string, userId: string) {
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        orders: {
          where: { status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY'] } },
          select: { id: true },
        },
      },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');
    
    // Se não estiver em CLOSING, verifica se há pedidos ativos
    if (table.status !== 'CLOSING' && table.orders.length > 0) {
      throw new BadRequestException('Mesa possui pedidos abertos. Solicite o fechamento de conta primeiro.');
    }

    const mergedTableIds = (
      await prisma.table.findMany({ where: { status: 'MERGED' }, select: { id: true } })
    ).map((t) => t.id);

    await prisma.$transaction(async (tx) => {
      // Fechar sessão ativa, se existir
      if (table.activeSessionId) {
        await tx.tableSession.update({
          where: { id: table.activeSessionId },
          data: {
            status: TableSessionStatus.CLOSED,
            closedBy: userId,
            closedAt: new Date(),
          },
        });
      }

      await tx.table.update({
        where: { id: tableId },
        data: {
          status: 'CLEANING',
          numberofpeople: null,
          customerId: null,
          activeSessionId: null,
          userId,
        },
      });

      if (mergedTableIds.length > 0) {
        await tx.table.updateMany({
          where: { id: { in: mergedTableIds } },
          data: { status: 'CLEANING', numberofpeople: null, customerId: null, activeSessionId: null, userId },
        });
      }
    });
  }

  /**
   * Marca mesa como limpa e disponível
   */
  async markTableAsClean(tableId: string, userId: string) {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    const mergedTableIds = (
      await prisma.table.findMany({ where: { status: 'MERGED' }, select: { id: true } })
    ).map((t) => t.id);

    await prisma.$transaction([
      prisma.table.update({
        where: { id: tableId },
        data: { status: 'AVAILABLE', numberofpeople: null, customerId: null, activeSessionId: null, userId },
      }),
      ...(mergedTableIds.length > 0
        ? [
            prisma.table.updateMany({
              where: { id: { in: mergedTableIds } },
              data: { status: 'AVAILABLE', numberofpeople: null, customerId: null, activeSessionId: null, userId },
            }),
          ]
        : []),
    ]);
  }

  /**
   * Transfere os pedidos (e a sessão ativa) de uma mesa para outra
   * Correção: aceita OCCUPIED além de OPEN
   */
  async transferTable(data: TransferTableDto, userId: string) {
    const [fromTableRaw, toTableRaw] = await Promise.all([
      prisma.table.findUnique({
        where: { id: data.fromTableId },
        include: {
          orders: {
            where: { status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY'] } },
          },
        },
      }),
      prisma.table.findUnique({ where: { id: data.toTableId } }),
    ]);

    if (!fromTableRaw || !toTableRaw) throw new NotFoundException('Mesa não encontrada');

    const fromTable = fromTableRaw;
    const toTable = toTableRaw;

    if (!['OPEN', 'OCCUPIED'].includes(fromTable.status)) {
      throw new BadRequestException('Mesa de origem não está ocupada');
    }
    if (!['CLOSED', 'AVAILABLE'].includes(toTable.status)) {
      throw new BadRequestException('Mesa de destino não está disponível');
    }

    await prisma.$transaction(async (tx) => {
      // Mover pedidos para a mesa destino
      await tx.order.updateMany({
        where: { id: { in: fromTable.orders.map((o) => o.id) } },
        data: { tableId: data.toTableId },
      });

      // Transferir a sessão ativa para a mesa destino
      if (fromTable.activeSessionId) {
        await tx.tableSession.update({
          where: { id: fromTable.activeSessionId },
          data: { tableId: data.toTableId },
        });
      }

      // Abrir mesa destino com os dados da origem
      await tx.table.update({
        where: { id: data.toTableId },
        data: {
          status: 'OCCUPIED',
          numberofpeople: fromTable.numberofpeople,
          customerId: fromTable.customerId,
          activeSessionId: fromTable.activeSessionId,
          userId,
        },
      });

      // Fechar mesa origem
      await tx.table.update({
        where: { id: data.fromTableId },
        data: {
          status: 'CLOSED',
          numberofpeople: null,
          customerId: null,
          activeSessionId: null,
          userId,
        },
      });
    });
  }

  /**
   * Junta múltiplas mesas
   */
  async mergeTables(data: MergeTablesDto, userId: string) {
    if (data.tableIds.length < 2) {
      throw new BadRequestException('Selecione ao menos 2 mesas');
    }

    const tables = await prisma.table.findMany({
      where: { id: { in: data.tableIds } },
      include: {
        orders: {
          where: {
            status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS, OrderStatus.READY] },
          },
          include: { items: true },
        },
      },
    });

    const targetTable = tables.find((t) => t.id === data.targetTableId);
    if (!targetTable) throw new NotFoundException('Mesa de destino não encontrada');

    const occupiedTables = tables.filter(
      (t) => ['OPEN', 'OCCUPIED'].includes(t.status) && t.orders.length > 0,
    );

    const existingOrder = targetTable.orders?.[0];
    let mainOrder = existingOrder;

    if (!mainOrder) {
      const lastOrder = await prisma.order.findFirst({
        where: { branchId: data.branchId },
        orderBy: { orderNumber: 'desc' },
      });
      const nextOrderNumber = (lastOrder?.orderNumber ?? 0) + 1;

      // Cria ou reutiliza sessão da mesa destino
      let sessionId = targetTable.activeSessionId;
      if (!sessionId) {
        const session = await prisma.tableSession.create({
          data: {
            tableId: data.targetTableId,
            branchId: data.branchId,
            openedBy: userId,
            numberOfPeople: tables.reduce((sum, t) => sum + (t.numberofpeople ?? 0), 0),
            customerId: data.customerId ?? null,
            status: TableSessionStatus.OPEN,
          },
        });
        sessionId = session.id;
      }

      mainOrder = await prisma.order.create({
        data: {
          branchId: data.branchId,
          orderNumber: nextOrderNumber,
          status: OrderStatus.PENDING,
          deliveryType: DeliveryTypeDto.DINE_IN,
          customerId: data.customerId ?? null,
          customerType: CustomerType.GUEST,
          serviceType: ServiceType.TABLE,
          channel: OrderChannel.PDV,
          tableId: data.targetTableId,
          tableSessionId: sessionId,
          subtotal: 0,
          total: 0,
          serviceFee: 0,
          discount: 0,
        },
        include: { items: true, customer: true },
      });
    }

    const otherOrders = occupiedTables
      .filter((t) => t.id !== data.targetTableId)
      .flatMap((t) => t.orders);

    await prisma.$transaction(async (tx) => {
      // Mover itens dos outros pedidos para o pedido principal
      for (const order of otherOrders) {
        await tx.orderItem.updateMany({
          where: { orderId: order.id },
          data: { orderId: mainOrder!.id },
        });
      }

      const mergedTableIds = data.tableIds.filter((id) => id !== data.targetTableId);
      const totalPeople = tables.reduce((sum, t) => sum + (t.numberofpeople ?? 0), 0);
      const hasOrders = occupiedTables.length > 0 || !!mainOrder;

      if (mergedTableIds.length > 0) {
        await tx.order.update({
          where: { id: mainOrder!.id },
          data: { notes: `Mesas unificadas: ${mergedTableIds.join(', ')}` },
        });
      }

      // Fechar sessões das mesas secundárias
      const secondaryTables = tables.filter((t) => mergedTableIds.includes(t.id));
      for (const st of secondaryTables) {
        if (st.activeSessionId) {
          await tx.tableSession.update({
            where: { id: st.activeSessionId },
            data: { status: TableSessionStatus.CLOSED, closedBy: userId, closedAt: new Date() },
          });
        }
      }

      // Atualizar mesa principal
      await tx.table.update({
        where: { id: data.targetTableId },
        data: {
          status: hasOrders ? 'OCCUPIED' : 'CLOSED',
          numberofpeople: totalPeople > 0 ? totalPeople : null,
          userId: targetTable.userId ?? occupiedTables[0]?.userId ?? userId,
          customerId: data.customerId ?? targetTable.customerId ?? occupiedTables[0]?.customerId ?? null,
          activeSessionId: mainOrder ? (targetTable.activeSessionId ?? null) : null,
        },
      });

      // Marcar mesas secundárias como MERGED
      await tx.table.updateMany({
        where: { id: { in: mergedTableIds } },
        data: { status: 'MERGED', numberofpeople: null, customerId: null, activeSessionId: null, userId },
      });
    });

    return { order: mainOrder };
  }

  /**
   * Reserva uma mesa
   */
  async reserveTable(tableId: string, data: ReserveTableDto) {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Mesa não encontrada');
    if (!['CLOSED', 'AVAILABLE'].includes(table.status)) {
      throw new BadRequestException('Mesa não está disponível');
    }

    await prisma.table.update({
      where: { id: tableId },
      data: { status: 'RESERVED', numberofpeople: data.numberOfPeople },
    });
  }

  /**
   * Cancela reserva de uma mesa
   */
  async cancelReservation(tableId: string) {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Mesa não encontrada');

    await prisma.table.update({
      where: { id: tableId },
      data: { status: 'CLOSED', numberofpeople: null },
    });
  }

  /**
   * Solicita fechamento de conta (transiciona mesa para CLOSING)
   */
  async requestBill(tableId: string, data: RequestBillDto, userId: string) {
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        activeSession: true,
        orders: {
          where: {
            status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY'] },
          },
        },
      },
    });

    if (!table) throw new NotFoundException('Mesa não encontrada');
    if (!['OCCUPIED', 'OPEN'].includes(table.status)) {
      throw new BadRequestException('Mesa não está ocupada');
    }
    if (!table.activeSessionId) {
      throw new BadRequestException('Mesa não possui sessão ativa');
    }

    await prisma.$transaction(async (tx) => {
      // Transiciona mesa para CLOSING
      await tx.table.update({
        where: { id: tableId },
        data: {
          status: 'CLOSING',
          userId,
        },
      });

      // Transiciona sessão ativa para CLOSING
      if (table.activeSessionId) {
        await tx.tableSession.update({
          where: { id: table.activeSessionId },
          data: {
            status: TableSessionStatus.CLOSING,
          },
        });
      }
    });

    return {
      success: true,
      message: 'Conta solicitada com sucesso',
      tableId,
    };
  }

  /**
   * Cria múltiplas mesas de uma vez
   */
  async bulkCreateTables(data: BulkCreateTablesDto, userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const { startNumber, quantity, numberofpeople, identification, type } = data;

    const tablesToCreate: Prisma.TableCreateManyInput[] = [];

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < quantity; i++) {
      const tableNumber = String(startNumber + i);
      const existing = await prisma.table.findFirst({
        where: { branchId: user.branchId ?? '', number: tableNumber },
        select: { id: true },
      });

      if (existing) { skipped++; continue; }

      tablesToCreate.push({
        branchId: user.branchId ?? '',
        number: tableNumber,
        status: 'CLOSED',
        type: type ?? 'MESA',
        isActive: true,
        numberofpeople,
        identification,
        userId: user.id,
      });
    }

    if (tablesToCreate.length > 0) {
      await prisma.table.createMany({ data: tablesToCreate });
      created = tablesToCreate.length;
    }

    return { created, skipped, total: quantity };
  }

  async updateTableStatus(tableId: string, status: TableStatus, _userId: string) {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Mesa não encontrada');
    if (status === TableStatus.ALL) throw new BadRequestException('Status inválido');

    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data: { status },
    });

    let activeOrder: Order | null = null;
    if (updatedTable.activeSessionId) {
      // Busca o pedido mais recente da sessão ativa
      activeOrder = await prisma.order.findFirst({
        where: {
          tableSessionId: updatedTable.activeSessionId,
          status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY'] },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return { table: updatedTable, activeOrder };
  }
}
