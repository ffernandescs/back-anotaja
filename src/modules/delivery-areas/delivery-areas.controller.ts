import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { DeliveryAreasService } from './delivery-areas.service';
import { CreateDeliveryAreaDto } from './dto/create-delivery-area.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CreateDeliveryAreaExclusionDto } from './dto/create-delivery-area-exclusion.dto';
import { UpdateDeliveryAreaExclusionDto, UpdateDeliveryAreaLevelDto } from './dto/update-delivery-area.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('delivery-areas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryAreasController {
  constructor(private readonly deliveryAreasService: DeliveryAreasService) {}


  @Roles('admin', 'manager')
  @Get('exclusion')
  async findAllExclusion(@Req() req: RequestWithUser) {
    return this.deliveryAreasService.findAllExclusion(req.user.userId);
  }

  @Roles('admin', 'manager')
  @Get('exclusion/:id')
  findOneExclusion(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deliveryAreasService.findOneExclusion(req.user.userId, id);
  }
  // ========== DELIVERY AREAS ==========
  @Roles('admin', 'manager')
  @Post()
  create(@Body() createDeliveryAreaDto: CreateDeliveryAreaDto, @Req() req: RequestWithUser) {
    return this.deliveryAreasService.create(req.user.userId, createDeliveryAreaDto);
  }

  @Roles('admin', 'manager')
  @Get()
  async findAll(@Req() req: RequestWithUser) {
    return this.deliveryAreasService.findAll(req.user.userId);
  }

  @Roles('admin', 'manager')
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deliveryAreasService.findOne(req.user.userId, id);
  }

  @Roles('admin', 'manager')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDeliveryAreaDto: UpdateDeliveryAreaExclusionDto,
    @Req() req: RequestWithUser
  ) {
    return this.deliveryAreasService.update(req.user.userId, id, updateDeliveryAreaDto);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deliveryAreasService.remove(req.user.userId, id);
  }

  // ========== EXCLUSION AREAS ==========
  @Roles('admin', 'manager')
  @Post('exclusion')
  createExclusion(
    @Body() createDeliveryAreaExclusionDto: CreateDeliveryAreaExclusionDto,
    @Req() req: RequestWithUser
  ) {
    return this.deliveryAreasService.createExclusion(req.user.userId, createDeliveryAreaExclusionDto);
  }


  @Roles('admin', 'manager')
  @Patch(':id/level')
  updateLevel(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryAreaLevelDto,
    @Req() req: RequestWithUser,
  ) {
    return this.deliveryAreasService.updateLevel(
      req.user.userId,
      id,
      dto.level,
    );
}

  @Roles('admin', 'manager')
  @Patch('exclusion/:id')
  updateExclusion(
    @Param('id') id: string,
    @Body() updateDeliveryAreaExclusionDto: UpdateDeliveryAreaExclusionDto,
    @Req() req: RequestWithUser
  ) {
    return this.deliveryAreasService.updateExclusion(req.user.userId, id, updateDeliveryAreaExclusionDto);
  }

  @Roles('admin', 'manager')
  @Delete('exclusion/:id')
  removeExclusion(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deliveryAreasService.removeExclusion(req.user.userId, id);
  }
}