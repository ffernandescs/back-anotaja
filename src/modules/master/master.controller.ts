import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Param,
} from '@nestjs/common';
import { MasterService } from './master.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtOwnerAuthGuard } from 'src/common/guards/jwt-owner.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('master')
export class MasterController {
  constructor(private readonly masterService: MasterService) {}

  @Public()
  @Get('subscriptions')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async getAllSubscriptions() {
    return this.masterService.findAllSubscriptions();
  }

  @Public()
  @Get('companies')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async getAllCompanies() {
    return this.masterService.findAllCompanies();
  }

  @Public()
  @Get('companies/:id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async getCompanyById(@Param('id') id: string) {
    return this.masterService.findCompanyById(id);
  }

  @Public()
  @Get('plans')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async getAllPlans() {
    return this.masterService.findAllPlans();
  }

  @Public()
  @Post('subscriptions')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.CREATED)
  async createSubscription(@Body() data: any) {
    return this.masterService.createSubscription(data);
  }
}
