import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Headers,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AddonsService } from './addons.service';
import { CreateAddonDto } from './dto/create-addon.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';
import { JwtOwnerAuthGuard } from '../../common/guards/jwt-owner.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('addons')
export class AddonsController {
  constructor(private readonly addonsService: AddonsService) {}

  @Public()
  @Post()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  create(
    @Body() createAddonDto: CreateAddonDto,
    @Req() req?: Request,
  ) {
    // Se necessário, você pode usar o token para validações adicionais
    return this.addonsService.create(createAddonDto);
  }

  @Get()
  findAll() {
    return this.addonsService.findAll();
  }

  @Public()
  @Get('all')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findAllIncludingInactive(
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.addonsService.findAllIncludingInactive();
  }

  @Public()
  @Get('key/:key')
  findByKey(@Param('key') key: string) {
    return this.addonsService.findByKey(key);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.addonsService.findOne(id);
  }

  @Public()
  @Patch(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  update(
    @Param('id') id: string,
    @Body() updateAddonDto: UpdateAddonDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.addonsService.update(id, updateAddonDto);
  }

  @Public()
  @Patch(':id/toggle')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  toggleActive(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.addonsService.toggleActive(id);
  }

  @Public()
  @Delete(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.addonsService.remove(id);
  }

  // Endpoints para gestão de features do addon
  @Public()
  @Post(':addonId/features/:featureId')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  addFeature(
    @Param('addonId') addonId: string,
    @Param('featureId') featureId: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.addonsService.addFeature(addonId, featureId);
  }

  @Public()
  @Delete(':addonId/features/:featureId')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  removeFeature(
    @Param('addonId') addonId: string,
    @Param('featureId') featureId: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.addonsService.removeFeature(addonId, featureId);
  }
}
