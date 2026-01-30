import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DeliveryPersonsService } from './delivery-persons.service';
import { CreateDeliveryPersonDto } from './dto/create-delivery-person.dto';
import { GenerateDeliveryPasswordDto } from './dto/generate-delivery-password.dto';
import { UpdateDeliveryPersonDto } from './dto/update-delivery-person.dto';
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

@Controller('delivery-persons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryPersonsController {
  constructor(
    private readonly deliveryPersonsService: DeliveryPersonsService,
  ) {}

  @Post()
  @Roles('admin', 'manager')
  create(
    @Body() createDeliveryPersonDto: CreateDeliveryPersonDto,
    @Req() req: RequestWithUser,
  ) {
    return this.deliveryPersonsService.create(
      createDeliveryPersonDto,
      req.user.userId,
    );
  }

  @Post('generate-password')
  @Roles('admin', 'manager')
  generatePassword(
    @Body() dto: GenerateDeliveryPasswordDto,
    @Req() req: RequestWithUser,
  ) {
    const deliveryPersonId = dto.deliveryPersonId ?? dto.userId;

    if (!deliveryPersonId) {
      throw new Error('deliveryPersonId ou userId é obrigatório');
    }

    return this.deliveryPersonsService.generatePassword(
      req.user.userId,
      deliveryPersonId,
      dto.type,
    );
  }

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('active') active?: string,
    @Query('isOnline') isOnline?: string,
  ) {
    return this.deliveryPersonsService.findAll(
      req.user.userId,
      active,
      isOnline,
    );
  }

  @Get('online')
  findOnline(@Req() req: RequestWithUser) {
    return this.deliveryPersonsService.findOnline(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deliveryPersonsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() updateDeliveryPersonDto: UpdateDeliveryPersonDto,
    @Req() req: RequestWithUser,
  ) {
    return this.deliveryPersonsService.update(
      id,
      updateDeliveryPersonDto,
      req.user.userId,
    );
  }

  @Patch(':id/online-status')
  @Roles('admin', 'manager')
  updateOnlineStatus(
    @Param('id') id: string,
    @Body('isOnline') isOnline: boolean,
    @Req() req: RequestWithUser,
  ) {
    return this.deliveryPersonsService.updateOnlineStatus(
      id,
      isOnline,
      req.user.userId,
    );
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string) {
    return this.deliveryPersonsService.remove(id);
  }
}
