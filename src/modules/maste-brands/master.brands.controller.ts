import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MasterBrandService, CreateBrandDto, UpdateBrandDto } from './master.brands.service';
import { MasterBrandPaymentService } from './master.brand-payment.service';
import type { BrandPaymentIntegrationDto } from './subscription-payment.types';
import { JwtOwnerAuthGuard } from 'src/common/guards/jwt-owner.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UploadService } from '../upload/upload.service';

@Controller('master/brands')
export class MasterBrandController {
  constructor(
    private readonly brandService: MasterBrandService,
    private readonly brandPaymentService: MasterBrandPaymentService,
    private readonly uploadService: UploadService,
  ) {}

  // ─── List ─────────────────────────────────────────────────────────────────────
  // GET /master/brands

  @Public()
  @Get()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async findAll(@Request() req) {
    return this.brandService.findAll(req.user.userId);
  }

  // ─── Resolução pública por host (white-label) ────────────────────────────────
  // GET /master/brands/public/by-host?host=app.revenda.com

  @Public()
  @Get('public/by-host')
  @HttpCode(HttpStatus.OK)
  async resolveByHost(@Query('host') host: string) {
    return this.brandService.resolvePublicByHost(host ?? '');
  }

  // ─── Integração de pagamento (assinaturas) por brand ─────────────────────────

  @Public()
  @Get(':brandId/payment-integration')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async getPaymentIntegration(
    @Param('brandId') brandId: string,
    @Request() req,
  ) {
    return this.brandPaymentService.getIntegration(brandId, req.user.userId);
  }

  @Public()
  @Put(':brandId/payment-integration')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async upsertPaymentIntegration(
    @Param('brandId') brandId: string,
    @Request() req,
    @Body() dto: BrandPaymentIntegrationDto,
  ) {
    return this.brandPaymentService.upsertIntegration(
      brandId,
      req.user.userId,
      dto,
    );
  }

  // ─── Single ───────────────────────────────────────────────────────────────────
  // GET /master/brands/:id

  @Public()
  @Get(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string, @Request() req) {
    return this.brandService.findOne(id, req.user.userId);
  }

  // ─── Create ───────────────────────────────────────────────────────────────────
  // POST /master/brands

  @Public()
  @Post()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req, @Body() dto: CreateBrandDto) {
    return this.brandService.create(req.user.userId, dto);
  }

  // ─── Update ───────────────────────────────────────────────────────────────────
  // PUT /master/brands/:id

  @Public()
  @Put(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.brandService.update(id, req.user.userId, dto);
  }

  // ─── Set Default ──────────────────────────────────────────────────────────────
  // PATCH /master/brands/:id/default

  @Public()
  @Patch(':id/default')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async setDefault(@Param('id') id: string, @Request() req) {
    return this.brandService.setDefault(id, req.user.userId);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────
  // DELETE /master/brands/:id

  @Public()
  @Delete(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @Request() req) {
    return this.brandService.remove(id, req.user.userId);
  }

  // ─── Upload: logo clara ───────────────────────────────────────────────────────
  // POST /master/brands/upload/logo-light

  @Public()
@Post('branding/logo-light')
@UseGuards(JwtOwnerAuthGuard)
@Roles('master')
@UseInterceptors(FileInterceptor('file'))
@HttpCode(HttpStatus.OK)
async uploadLogoLight(
  @Request() req,
  @Query('brandId') brandId: string | undefined,
  @UploadedFile() file: Express.Multer.File,
) {
  const url = await this.uploadService.uploadFile(file, 'master/brands/logos-light');
  // Sem brandId: só devolve URL (fluxo "Novo brand" — evita criar MasterBrand "Padrão" via updateBranding legado)
  if (brandId?.trim()) {
    await this.brandService.update(brandId.trim(), req.user.userId, { logoLightUrl: url });
  }
  return { url };
}

@Public()
@Post('branding/logo-dark')
@UseGuards(JwtOwnerAuthGuard)
@Roles('master')
@UseInterceptors(FileInterceptor('file'))
@HttpCode(HttpStatus.OK)
async uploadLogoDark(
  @Request() req,
  @Query('brandId') brandId: string | undefined,
  @UploadedFile() file: Express.Multer.File,
) {
  const url = await this.uploadService.uploadFile(file, 'master/brands/logos-dark');
  if (brandId?.trim()) {
    await this.brandService.update(brandId.trim(), req.user.userId, { logoDarkUrl: url });
  }
  return { url };
}

@Public()
@Post('branding/favicon')
@UseGuards(JwtOwnerAuthGuard)
@Roles('master')
@UseInterceptors(FileInterceptor('file'))
@HttpCode(HttpStatus.OK)
async uploadFavicon(
  @Request() req,
  @Query('brandId') brandId: string | undefined,
  @UploadedFile() file: Express.Multer.File,
) {
  const url = await this.uploadService.uploadFile(file, 'master/brands/favicons');
  if (brandId?.trim()) {
    await this.brandService.update(brandId.trim(), req.user.userId, { faviconUrl: url });
  }
  return { url };
}
}