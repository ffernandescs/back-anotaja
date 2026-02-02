import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { CreateStockMovementDto, StockItemType } from './dto/create-stock-movement.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('stock-movements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post()
  @Roles('admin', 'manager')
  create(
    @Body() createStockMovementDto: CreateStockMovementDto,
    @Req() req: RequestWithUser,
  ) {
    return this.stockService.createMovement(createStockMovementDto, req.user.userId);
  }

  @Get()
  @Roles('admin', 'manager')
  findAll(
    @Req() req: RequestWithUser,
    @Query('itemType') itemType?: StockItemType,
    @Query('itemId') itemId?: string,
  ) {
    return this.stockService.findAll(req.user.userId, itemType, itemId);
  }

  @Get(':id')
  @Roles('admin', 'manager')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.stockService.findOne(id, req.user.userId);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.stockService.delete(id, req.user.userId);
  }
}
