import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Headers,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { LimitsService } from './limits.service';
import { CreateLimitDto } from './dto/create-limit.dto';
import { UpdateLimitDto } from './dto/update-limit.dto';
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

@Controller('limits')
export class LimitsController {
  constructor(private readonly limitsService: LimitsService) {}

  @Public()
  @Post()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  create(
    @Body() createLimitDto: CreateLimitDto,
    @Req() req?: Request,
  ) {
    return this.limitsService.create(createLimitDto);
  }

  @Public()
  @Get()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findAll(
    @Query('planId') planId?: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.limitsService.findAll(planId);
  }

  @Public()
  @Get('stats')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  getStats(
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.limitsService.getStats();
  }

  @Public()
  @Get('plan/:planId')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findByPlan(
    @Param('planId') planId: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.limitsService.findByPlan(planId);
  }

  @Public()
  @Get(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findOne(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.limitsService.findOne(id);
  }

  @Public()
  @Patch(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  update(
    @Param('id') id: string,
    @Body() updateLimitDto: UpdateLimitDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.limitsService.update(id, updateLimitDto);
  }

  @Public()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.limitsService.remove(id);
  }

  @Public()
  @Delete('plan/:planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  removeAllByPlan(
    @Param('planId') planId: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    return this.limitsService.removeAllByPlan(planId);
  }
}
