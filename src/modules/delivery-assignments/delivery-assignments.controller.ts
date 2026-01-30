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

  @Get()
  @Roles('admin', 'manager')
  findAll(@Req() req: RequestWithUser) {
    return this.deliveryAssignmentsService.findAll(req.user.userId);
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

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deliveryAssignmentsService.remove(id, req.user.userId);
  }

  @Put(':id')
  @Roles('admin', 'manager')
  assignDeliveryPerson(
    @Param('id') id: string,
    @Body() dto: AssignDeliveryPersonDto,
    @Req() req: RequestWithUser,
  ) {
    return this.deliveryAssignmentsService.assignDeliveryPerson(
      id,
      dto.deliveryPersonId,
      req.user.userId,
    );
  }

  // ... outros endpoints existentes ...
}
