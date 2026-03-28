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
import { MenuGroupsService } from './menu-groups.service';
import { CreateMenuGroupDto } from './dto/create-menu-group.dto';
import { UpdateMenuGroupDto } from './dto/update-menu-group.dto';
import { ReorderMenuGroupsDto } from './dto/reorder-menu-groups.dto';
import { JwtOwnerAuthGuard } from '../../common/guards/jwt-owner.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('menu-groups')
export class MenuGroupsController {
  constructor(private readonly menuGroupsService: MenuGroupsService) {}

  @Public()
  @Post()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  create(
    @Body() createMenuGroupDto: CreateMenuGroupDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.menuGroupsService.create(createMenuGroupDto);
  }

  @Public()
  @Get()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findAll(@Req() req?: Request) {
    return this.menuGroupsService.findAll();
  }

  @Public()
  @Get('all')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findAllIncludingInactive(@Req() req?: Request) {
    return this.menuGroupsService.findAllIncludingInactive();
  }

  @Public()
  @Get(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findOne(@Param('id') id: string) {
    return this.menuGroupsService.findOne(id);
  }

  @Public()
  @Patch('reorder')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  reorder(
    @Body() reorderMenuGroupsDto: ReorderMenuGroupsDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    console.log('DTO recebido:', reorderMenuGroupsDto);
    return this.menuGroupsService.reorder(reorderMenuGroupsDto);
  }
  
  @Public()
  @Patch(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  update(
    @Param('id') id: string,
    @Body() updateMenuGroupDto: UpdateMenuGroupDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.menuGroupsService.update(id, updateMenuGroupDto);
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
    return this.menuGroupsService.remove(id);
  }

  @Public()
  @Post(':groupId/features/:featureId')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  addFeatureToGroup(
    @Param('groupId') groupId: string,
    @Param('featureId') featureId: string,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    return this.menuGroupsService.addFeatureToGroup(groupId, featureId);
  }

  @Public()
  @Delete(':groupId/features/:featureId')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  removeFeatureFromGroup(
    @Param('groupId') groupId: string,
    @Param('featureId') featureId: string,
    @Req() req?: Request,
    @Headers('authorization') authorization?: string,
  ) {
    return this.menuGroupsService.removeFeatureFromGroup(groupId, featureId);
  }

  @Public()
  @Get(':id/features')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  getGroupFeatures(@Param('id') id: string) {
    return this.menuGroupsService.getGroupFeatures(id);
  }

  @Public()
  @Get(':id/features/available')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  getAvailableFeaturesForGroup(@Param('id') id: string) {
    return this.menuGroupsService.getAvailableFeaturesForGroup(id);
  }

  
}
