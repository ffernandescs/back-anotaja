import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Patch,
} from '@nestjs/common';
import { TablesService } from './tables.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateTableDto,
  UpdateTableDto,
  OpenTableDto,
  TransferTableDto,
  MergeTablesDto,
  ReserveTableDto,
  BulkCreateTablesDto,
} from './dto/index';
import { UpdateTableStatusDto } from './dto/update-table-status.dto';
import { TableStatus } from './types';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('tables')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  /**
   * GET /tables?branchId=xxx&includeMerged=false
   * Busca todas as mesas de uma filial
   */

  //Tem que filtrar as mesas pelo status da mesa
  @Get()
  @Roles('admin', 'waiter', 'manager')
  async getTables(
    @Query('branchId') branchId: string,
    @Query('includeMerged') includeMerged?: string,
    @Query('status') status?: TableStatus,
  ) {
    const include = includeMerged === 'true';
    const tables = await this.tablesService.getTables(
      branchId,
      include,
      status,
    );

    return {
      success: true,
      tables,
    };
  }

  /**
   * GET /tables/:id
   * Busca uma mesa específica
   */
  @Get(':id')
  @Roles('admin', 'waiter', 'manager')
  async getTable(@Param('id') id: string, @Req() req: RequestWithUser,) {
    const table = await this.tablesService.getTableById(id, req.user.userId);

    return {
      success: true,
      table,
    };
  }

  /**
   * POST /tables
   * Cria uma nova mesa
   */
  @Post()
  @Roles('admin', 'manager')
  async createTable(
    @Body() createTableDto: CreateTableDto,
    @Req() req: RequestWithUser,
  ) {
    const table = await this.tablesService.createTable(
      createTableDto,
      req.user.userId,
    );

    return {
      success: true,
      table,
    };
  }

  /**
   * PUT /tables/:id
   * Atualiza uma mesa
   */
  @Put(':id')
  @Roles('admin', 'manager')
  async updateTable(
    @Param('id') id: string,
    @Body() updateTableDto: UpdateTableDto,
    @Req() req: RequestWithUser,
  ) {
    const table = await this.tablesService.updateTable(
      id,
      updateTableDto,
      req.user.userId,
    );

    return {
      success: true,
      table,
    };
  }

  /**
   * DELETE /tables/:id
   * Remove uma mesa (só se estiver disponível)
   */
  @Delete(':id')
  @Roles('admin', 'manager')
  async deleteTable(@Param('id') id: string) {
    await this.tablesService.deleteTable(id);

    return {
      success: true,
      message: 'Mesa removida com sucesso',
    };
  }

  /**
   * POST /tables/:id/open
   * Abre uma mesa e cria uma comanda
   */
  @Post(':id/open')
  @Roles('admin', 'waiter', 'manager')
  async openTable(
    @Param('id') id: string,
    @Body() openTableDto: OpenTableDto,
    @Req() req: RequestWithUser,
  ) {
    const result = await this.tablesService.openTable(
      id,
      {
        ...openTableDto,
      },
      req.user.userId,
    );

    return {
      success: true,
      table: result.table,
      order: result.order,
    };
  }

  /**
   * POST /tables/:id/close
   * Fecha uma mesa (após pagamento)
   */
  @Post(':id/close')
  @Roles('admin', 'waiter', 'manager')
  async closeTable(@Param('id') id: string, @Req() req: RequestWithUser) {
    await this.tablesService.closeTable(id, req.user.userId);

    return {
      success: true,
      message: 'Mesa fechada com sucesso',
    };
  }

  /**
   * POST /tables/:id/clean
   * Marca mesa como limpa e disponível
   */
  @Post(':id/clean')
  @Roles('admin', 'waiter', 'manager')
  async markTableAsClean(@Param('id') id: string, @Req() req: RequestWithUser) {
    await this.tablesService.markTableAsClean(id, req.user.userId);

    return {
      success: true,
      message: 'Mesa marcada como limpa',
    };
  }

  /**
   * POST /tables/transfer
   * Transfere uma mesa para outra
   */
  @Post('transfer')
  @Roles('admin', 'waiter', 'manager')
  async transferTable(
    @Body() transferTableDto: TransferTableDto,
    @Req() req: RequestWithUser,
  ) {
    await this.tablesService.transferTable(transferTableDto, req.user.userId);

    return {
      success: true,
      message: 'Mesa transferida com sucesso',
    };
  }

  /**
   * POST /tables/merge
   * Junta múltiplas mesas
   */
  @Post('merge')
  @Roles('admin', 'waiter', 'manager')
  async mergeTables(
    @Body() mergeTablesDto: MergeTablesDto,
    @Req() req: RequestWithUser,
  ) {
    const result = await this.tablesService.mergeTables(
      mergeTablesDto,
      req.user.userId,
    );

    return {
      success: true,
      order: result.order,
      message: 'Mesas unificadas com sucesso',
    };
  }

  /**
   * POST /tables/:id/reserve
   * Reserva uma mesa
   */
  @Post(':id/reserve')
  @Roles('admin', 'waiter', 'manager')
  async reserveTable(
    @Param('id') id: string,
    @Body() reserveTableDto: ReserveTableDto,
  ) {
    await this.tablesService.reserveTable(id, reserveTableDto);

    return {
      success: true,
      message: 'Mesa reservada com sucesso',
    };
  }

  /**
   * DELETE /tables/:id/reservation
   * Cancela reserva de uma mesa
   */
  @Delete(':id/reservation')
  @Roles('admin', 'waiter', 'manager')
  async cancelReservation(@Param('id') id: string) {
    await this.tablesService.cancelReservation(id);

    return {
      success: true,
      message: 'Reserva cancelada com sucesso',
    };
  }

  @Post('bulk')
  @Roles('admin', 'manager')
  async bulkCreateTables(
    @Body() bulkCreateDto: BulkCreateTablesDto,
    @Req() req: RequestWithUser,
  ) {
    const result = await this.tablesService.bulkCreateTables(
      bulkCreateDto,
      req.user.userId,
    );

    return {
      success: true,
      ...result,
    };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') tableId: string,
    @Body() dto: UpdateTableStatusDto,
    @Req() req: RequestWithUser,
  ) {
    return await this.tablesService.updateTableStatus(
      tableId,
      dto.status,
      req.user.userId,
    );
  }
  /**
   * POST /tables/bulk
   * Cria múltiplas mesas de uma vez
   */
}
