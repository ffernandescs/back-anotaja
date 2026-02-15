import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  BulkCreateTablesDto,
  CreateTableDto,
  MergeTablesDto,
  OpenTableDto,
  ReserveTableDto,
  TransferTableDto,
  UpdateTableDto,
} from './dto/index';
import {
  DeliveryTypeDto,
  OrderStatusDto,
} from '../orders/dto/create-order-item.dto';
import { TableStatus } from './types';
import { OrdersService } from '../orders/orders.service';
import { money } from '../../utils/money';
@Injectable()
export class TablesService {
  constructor(private readonly ordersService: OrdersService) {}
  /**
   * Busca todas as mesas de uma filial
   */
  async getTables(
    branchId: string,
    includeMerged: boolean = false,
    status?: TableStatus,
  ) {
    const whereCondition: Prisma.TableWhereInput = { branchId };

    if (!includeMerged) {
      whereCondition.status = { not: 'MERGED' };
    }

    //Filtrar as mesas pelo status da mesa porem se vim ALL, nao filtrar pelo status
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
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        orders: {
          where: {
            status: { in: ['PREPARING', 'PENDING', 'CONFIRMED'] },
          },
          select: {
            id: true,
            orderNumber: true,
            total: true,
            _count: {
              select: {
                items: true,
              },
            },
          },
        },
      },
      orderBy: {
        number: 'asc',
      },
    });
  }

  /**
   * Busca uma mesa específica por ID
   */
  async getTableById(id: string) {
    const table = await prisma.table.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        orders: {
          where: {
            status: { in: ['PREPARING', 'PENDING', 'CONFIRMED', 'READY'] },
          },
          include: {
            items: {
              include: {
                product: true
              }
            },
            customer: true,
            
          },
        },
      },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    return table;
  }

  /**
   * Cria uma nova mesa
   */
  async createTable(data: CreateTableDto, userId: string) {
    const existing = await prisma.table.findFirst({
      where: {
        branchId: data.branchId,
        number: data.number,
      },
    });

    if (existing) {
      throw new BadRequestException('Já existe uma mesa com este número');
    }

    return prisma.table.create({
      data: {
        branchId: data.branchId,
        number: data.number,
        identification: data.identification,
        status: 'OPEN',
        userId,
      },
    });
  }

  /**
   * Atualiza uma mesa
   */
  async updateTable(tableId: string, data: UpdateTableDto, userId: string) {
    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    if (data.number !== undefined && data.number !== table.number) {
      const existing = await prisma.table.findFirst({
        where: {
          branchId: table.branchId,
          number: data.number,
          id: { not: tableId },
        },
      });

      if (existing) {
        throw new BadRequestException('Já existe uma mesa com este número');
      }
    }
    if (data.status === TableStatus.ALL) {
      throw new BadRequestException('Status inválido');
    }

    const { number, identification, status, numberOfPeople, customerId } = data;

    return prisma.table.update({
      where: { id: tableId },
      data: {
        ...(number !== undefined ? { number } : {}),
        ...(identification !== undefined ? { identification } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(numberOfPeople !== undefined ? { numberofpeople: numberOfPeople } : {}),
        customerId: customerId ?? null,
        userId,
      },
    });
  }

  /**
   * Remove uma mesa
   */
  async deleteTable(tableId: string) {
    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    if (table.status !== 'CLOSED') {
      throw new BadRequestException('Só é possível remover mesas disponíveis');
    }

    await prisma.table.delete({
      where: { id: tableId },
    });
  }

  /**
   * Abre uma mesa e cria uma comanda
   */
  async openTable(tableId: string, data: OpenTableDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    if (table.status === 'OPEN') {
      throw new BadRequestException('Mesa já está ocupada');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    const productIds = data.items.map((item) => item.productId);

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('Um ou mais produtos não foram encontrados');
    }

    const lastOrder = await prisma.order.findFirst({
      where: { branchId: user.branchId },
      orderBy: { orderNumber: 'desc' },
    });

    const orderNumber = lastOrder?.orderNumber ? lastOrder.orderNumber + 1 : 1;

    const [updatedTable, order] = await prisma.$transaction([
      prisma.table.update({
        where: { id: tableId },
        data: {
          status: 'OPEN',
          numberofpeople: data.numberOfPeople,
          userId: userId,
          customerId: data.customerId,
        },
      }),
      prisma.order.create({
        data: {
          branchId: user.branchId,
          orderNumber,
          status: OrderStatusDto.PENDING,
          deliveryType: data.deliveryType,
          paymentStatus: 'PENDING',
          paidAmount: 0,
          customerId: data.customerId,
          tableId: tableId,
          subtotal: data.subtotal,
          total: data.total,
          serviceFee: data.serviceFee,
          discount: data.discount,
          notes: data.notes,
          couponId: data.couponId,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: money(item.price),
              notes: item.notes || null,
              preparationStatus: 'PENDING',
              dispatchStatus: 'PENDING',
              additions: item.additions
                ? {
                    create: item.additions.map((addition) => ({
                      additionId: addition.additionId,
                    })),
                  }
                : undefined,
              complements: item.complements
                ? {
                    create: item.complements.map((complement) => ({
                      complementId: complement.complementId,
                      options: complement.options
                        ? {
                            create: complement.options.map((option) => ({
                              optionId: option.optionId,
                            })),
                          }
                        : undefined,
                    })),
                  }
                : undefined,
            })),
          },
        },
      }),
    ]);

    return { table: updatedTable, order };
  }

  /**
   * Fecha uma mesa
   */
  async closeTable(tableId: string, userId: string) {
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        orders: {
          where: {
            status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    if (table.orders.length > 0) {
      throw new BadRequestException('Mesa possui comandas abertas');
    }

    const mergedTables = await prisma.table.findMany({
      where: {
        status: 'MERGED',
      },
      select: { id: true },
    });

    const mergedTableIds = mergedTables.map((t) => t.id);

    await prisma.$transaction([
      prisma.table.update({
        where: { id: tableId },
        data: {
          status: 'CLEANING',
          numberofpeople: null,
          userId: userId,
          customerId: null,
        },
      }),
      ...(mergedTableIds.length > 0
        ? [
            prisma.table.updateMany({
              where: { id: { in: mergedTableIds } },
              data: {
                status: 'CLEANING',
                numberofpeople: null,
                userId: userId,
                customerId: null,
              },
            }),
          ]
        : []),
    ]);
  }

  /**
   * Marca mesa como limpa
   */
  async markTableAsClean(tableId: string, userId: string) {
    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    const mergedTables = await prisma.table.findMany({
      where: {
        status: 'MERGED',
      },
      select: { id: true },
    });

    const mergedTableIds = mergedTables.map((t) => t.id);

    await prisma.$transaction([
      prisma.table.update({
        where: { id: tableId },
        data: {
          status: 'CLOSED',
          numberofpeople: null,
          userId: userId,
          customerId: null,
        },
      }),
      ...(mergedTableIds.length > 0
        ? [
            prisma.table.updateMany({
              where: { id: { in: mergedTableIds } },
              data: {
                status: 'CLOSED',
                numberofpeople: null,
                userId: userId,
                customerId: null,
              },
            }),
          ]
        : []),
    ]);
  }

  /**
   * Transfere uma mesa para outra
   */
  async transferTable(data: TransferTableDto, userId: string) {
    // Buscar as mesas de origem e destino
    const [fromTableRaw, toTableRaw] = await Promise.all([
      prisma.table.findUnique({
        where: { id: data.fromTableId },
        include: {
          orders: {
            where: {
              status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
            },
          },
        },
      }),
      prisma.table.findUnique({
        where: { id: data.toTableId },
      }),
    ]);

    // Verificar existência das mesas
    if (!fromTableRaw || !toTableRaw) {
      throw new NotFoundException('Mesa não encontrada');
    }

    // Garantir tipos não nulos para TypeScript
    const fromTable: NonNullable<typeof fromTableRaw> = fromTableRaw;
    const toTable: NonNullable<typeof toTableRaw> = toTableRaw;

    // Validar status das mesas
    if (fromTable.status !== 'OPEN') {
      throw new BadRequestException('Mesa de origem não está ocupada');
    }

    if (toTable.status !== 'CLOSED') {
      throw new BadRequestException('Mesa de destino não está disponível');
    }

    // Transação para mover pedidos e atualizar mesas
    await prisma.$transaction([
      // Atualizar todos os pedidos da mesa de origem para a mesa de destino
      ...fromTable.orders.map((order) =>
        prisma.order.update({
          where: { id: order.id },
          data: { tableId: data.toTableId },
        }),
      ),

      // Abrir a mesa de destino com os mesmos dados da origem
      prisma.table.update({
        where: { id: data.toTableId },
        data: {
          status: 'OPEN',
        },
      }),

      // Fechar a mesa de origem
      prisma.table.update({
        where: { id: data.fromTableId },
        data: {
          status: 'CLOSED',
          numberofpeople: null,
          userId: userId,
          customerId: null,
        },
      }),
    ]);
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
            status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
          },
          include: { items: true },
        },
      },
    });

    const targetTable = tables.find((t) => t.id === data.targetTableId);
    if (!targetTable) {
      throw new NotFoundException('Mesa de destino não encontrada');
    }

    const occupiedTables = tables.filter(
      (t) =>
        (t.status === 'OPEN' || t.status === 'OCCUPIED') && t.orders.length > 0,
    );

    // Pega o primeiro pedido existente ou cria um novo
    let mainOrder = targetTable.orders?.[0];
    if (!mainOrder) {
      const lastOrder = await prisma.order.findFirst({
        where: { branchId: data.branchId },
        orderBy: { orderNumber: 'desc' },
      });

      const nextOrderNumber = (lastOrder?.orderNumber ?? 0) + 1;

      mainOrder = await prisma.order.create({
        data: {
          branchId: data.branchId,
          orderNumber: nextOrderNumber,
          status: OrderStatusDto.PENDING,
          deliveryType: DeliveryTypeDto.DINE_IN,
          customerId: data.customerId ?? null,
          tableId: data.targetTableId,
          subtotal: 0,
          total: 0,
          serviceFee: 0,
          discount: 0,
        },
        include: { items: true, customer: true },
      });
    }

    // Mesas diferentes da targetTable
    const otherOrders = occupiedTables
      .filter((t) => t.id !== data.targetTableId)
      .flatMap((t) => t.orders);

    // Atualizar todos os itens dessas ordens para a mainOrder
    await Promise.all(
      otherOrders.map((order) =>
        prisma.orderItem.updateMany({
          where: { orderId: order.id },
          data: { orderId: mainOrder.id }, // mainOrder garantido
        }),
      ),
    );

    const mergedTableIds = data.tableIds.filter(
      (id) => id !== data.targetTableId,
    );

    if (mergedTableIds.length > 0) {
      await prisma.order.update({
        where: { id: mainOrder.id },
        data: { notes: `Mesas unificadas: ${mergedTableIds.join(', ')}` },
      });
    }

    const totalPeople = tables.reduce(
      (sum, t) => sum + (t.numberofpeople ?? 0),
      0,
    );
    const hasOrders = occupiedTables.length > 0 || !!mainOrder;

    // Atualizar mesas dentro de uma transação
    const newUserId: string | null =
      targetTable.userId ?? occupiedTables[0]?.userId ?? null;

    const newCustomerId: string | null =
      targetTable.customerId ?? occupiedTables[0]?.customerId ?? null;

    await prisma.$transaction([
      prisma.table.update({
        where: { id: data.targetTableId },
        data: {
          status: hasOrders ? 'OPEN' : 'CLOSED',
          numberofpeople: totalPeople > 0 ? totalPeople : null,
          userId: newUserId,
          customerId: newCustomerId,
        },
      }),
      prisma.table.updateMany({
        where: { id: { in: mergedTableIds } },
        data: {
          status: 'MERGED',
          numberofpeople: null,
          userId: userId,
          customerId: null,
        },
      }),
    ]);

    // Garantir que o retorno está tipado corretamente
    return { order: mainOrder };
  }

  /**
   * Reserva uma mesa
   */
  async reserveTable(tableId: string, data: ReserveTableDto) {
    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    if (table.status !== 'CLOSED') {
      throw new BadRequestException('Mesa não está disponível');
    }

    await prisma.table.update({
      where: { id: tableId },
      data: {
        status: 'RESERVED',
        numberofpeople: data.numberOfPeople,
      },
    });
  }

  /**
   * Cancela reserva de uma mesa
   */
  async cancelReservation(tableId: string) {
    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    await prisma.table.update({
      where: { id: tableId },
      data: {
        status: 'CLOSED',
        numberofpeople: null,
      },
    });
  }

  /**
   * Cria múltiplas mesas de uma vez
   */
  async bulkCreateTables(data: BulkCreateTablesDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const { startNumber, quantity, numberofpeople, identification } = data;

    const tablesToCreate: Array<{
      branchId: string;
      number: string;
      status: TableStatus;
      numberofpeople?: number;
      identification?: string;
      userId: string;
    }> = [];

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < quantity; i++) {
      const tableNumber = String(startNumber + i);

      const existing = await prisma.table.findFirst({
        where: {
          branchId: user.branchId ?? '',
          number: tableNumber,
        },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      tablesToCreate.push({
        branchId: user.branchId ?? '',
        number: tableNumber,
        status: TableStatus.AVAILABLE,
        numberofpeople,
        identification,
        userId: user.id,
      });
    }

    if (tablesToCreate.length > 0) {
      await prisma.table.createMany({
        data: tablesToCreate,
      });

      created = tablesToCreate.length;
    }

    return {
      created,
      skipped,
      total: quantity,
    };
  }

  async updateTableStatus(
    tableId: string,
    status: TableStatus,
    userId: string,
  ) {
    // Busca a mesa
    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      throw new NotFoundException('Mesa não encontrada');
    }

    if (status === TableStatus.ALL) {
      throw new BadRequestException('Status inválido');
    }
    // Atualiza o status da mesa
    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data: { status },
    });

    // Busca o pedido ativo, se existir
    let activeOrder: Order | null = null;
    if (updatedTable.activeOrderId) {
      activeOrder = await this.ordersService.findOne(
        updatedTable.activeOrderId,
        userId,
      ); // ✅ tipagem explícita
    }

    return {
      table: updatedTable,
      activeOrder,
    };
  }
}
