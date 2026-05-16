import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Param,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MasterService } from './master.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtOwnerAuthGuard } from 'src/common/guards/jwt-owner.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UploadService } from '../upload/upload.service';
import { IsObject } from 'class-validator';
import { OrderOriginsService } from '../order-origins/order-origins.service';
import {
  CreateOrderOriginDto,
  SuggestOrderOriginCodeDto,
  UpdateOrderOriginDto,
} from '../order-origins/dto/order-origins.dto';

class SetConfigDto {
  @IsObject()
  configs!: Record<string, string | null>;
}

@Controller('master')
export class MasterController {
  constructor(
    private readonly masterService: MasterService,
    private readonly uploadService: UploadService,
    private readonly orderOriginsService: OrderOriginsService,
  ) {}


  @Public()
  @Get()
  @UseGuards(JwtOwnerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getProfile(@Request() req) {
    return this.masterService.getProfile(req.user.userId);
  }

  @Public()
  @Get('branding')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async getBranding(@Request() req) {
    return this.masterService.getBranding(req.user.userId);
  }

  @Public()
  @Get('branding/public')
  @HttpCode(HttpStatus.OK)
  async getPublicBranding() {
    // Retorna branding do primeiro master user (para simplificar)
    const masterUser = await this.masterService.getFirstMasterUser();
    if (!masterUser) {
      return {
        logoUrl: null,
        faviconUrl: null,
        primaryColor: null,
        secondaryColor: null,
        accentColor: null,
        appName: null,
      };
    }
    return this.masterService.getBranding(masterUser.id);
  }

  

  @Public()
  @Post('config')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async updateConfig(@Body() data: { configs: any }) {
    return this.masterService.updateConfig(data.configs);
  }

  @Public()
  @Put('branding')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async updateBranding(@Request() req, @Body() data: {
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    appName?: string;
  }) {
    return this.masterService.updateBranding(req.user.userId, data);
  }

  @Public()
  @Post('branding/logo')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async uploadLogo(@Request() req, @UploadedFile() file: Express.Multer.File) {
    const logoUrl = await this.uploadService.uploadFile(file, 'master/logos');
    await this.masterService.updateBranding(req.user.userId, { logoUrl });
    return { logoUrl };
  }

  @Public()
  @Post('branding/favicon')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async uploadFavicon(@Request() req, @UploadedFile() file: Express.Multer.File) {
    const faviconUrl = await this.uploadService.uploadFile(file, 'master/favicons');
    await this.masterService.updateBranding(req.user.userId, { faviconUrl });
    return { faviconUrl };
  }

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

  @Public()
  @Get('config')
  @UseGuards(JwtOwnerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getConfig() {
    return this.masterService.getSystemConfigs();
  }

  @Public()
  @Post('system-config')
  @UseGuards(JwtOwnerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setConfig(@Body() dto: SetConfigDto) {
    return this.masterService.setSystemConfigs(dto.configs);
  }

  // ─── Origens de pedido (global) ─────────────────────────────────

  @Public()
  @Get('order-origins')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async getOrderOrigins() {
    return this.orderOriginsService.getOrderOrigins();
  }

  @Public()
  @Post('order-origins/suggest-code')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async suggestOrderOriginCode(@Body() dto: SuggestOrderOriginCodeDto) {
    return this.orderOriginsService.suggestOrderOriginCode(dto.name);
  }

  @Public()
  @Post('order-origins')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.CREATED)
  async createOrderOrigin(@Body() dto: CreateOrderOriginDto) {
    return this.orderOriginsService.createOrderOrigin(dto);
  }

  @Public()
  @Put('order-origins/:id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async updateOrderOrigin(
    @Param('id') id: string,
    @Body() dto: UpdateOrderOriginDto,
  ) {
    return this.orderOriginsService.updateOrderOrigin(id, dto);
  }

  @Public()
  @Delete('order-origins/:id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async deleteOrderOrigin(@Param('id') id: string) {
    return this.orderOriginsService.deleteOrderOrigin(id);
  }
}
