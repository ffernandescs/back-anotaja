import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  Query,
  Put,
} from '@nestjs/common';
import { DeliveryAssignmentsService } from './delivery-assignments.service';
import { AutoCreateRoutesDto } from './dto/auto-create-routes.dto';
import { OptimizeRoutesDto } from './dto/optimize-routes.dto';
import { CreateDeliveryAssignmentDto } from './dto/create-delivery-assignment.dto';
import { AssignDeliveryPersonDto } from './dto/assign-delivery-person.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('delivery-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryAssignmentsController {
  constructor(
    private readonly deliveryAssignmentsService: DeliveryAssignmentsService,
  ) {}

  @Post()
  @Roles('admin', 'manager')
  create(
    @Body() createDto: CreateDeliveryAssignmentDto,
    @Req() req: RequestWithUser,
  ) {
    return this.deliveryAssignmentsService.create(createDto, req.user.userId);
  }

  @Get()
  @Roles('admin', 'manager')
  findAll(@Req() req: RequestWithUser) {
    return this.deliveryAssignmentsService.findAll(req.user.userId);
  }

  @Get(':id')
  @Roles('admin', 'manager')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deliveryAssignmentsService.findOne(id, req.user.userId);
  }

  @Post('auto-create')
  @Roles('admin', 'manager')
  autoCreateRoutes(
    @Body() autoCreateRoutesDto: AutoCreateRoutesDto,
    @Req() req: RequestWithUser,
  ) {
    return this.deliveryAssignmentsService.autoCreateRoutes(
      autoCreateRoutesDto,
      req.user.userId,
    );
  }

  @Post('optimize')
  @Roles('admin', 'manager')
  optimizeRoutes(
    @Body() optimizeRoutesDto: OptimizeRoutesDto,
    @Req() req: RequestWithUser,
  ) {
    return this.deliveryAssignmentsService.optimizeRoutes(
      optimizeRoutesDto,
      req.user.userId,
    );
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deliveryAssignmentsService.remove(id, req.user.userId);
  }

  @Put(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @Req() req: RequestWithUser,
  ) {
    // Se o body contém deliveryPersonId, é uma atribuição de entregador
    if (dto.deliveryPersonId) {
      return this.deliveryAssignmentsService.assignDeliveryPerson(
        id,
        dto.deliveryPersonId,
        req.user.userId,
      );
    }
    
    // Se o body contém status, é uma atualização de status
    if (dto.status) {
      return this.deliveryAssignmentsService.updateStatus(
        id,
        dto.status,
        req.user.userId,
      );
    }

    return { success: false, message: 'Nenhuma ação válida fornecida' };
  }
}
