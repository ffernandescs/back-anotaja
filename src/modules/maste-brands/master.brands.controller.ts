import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MasterBrandService, CreateBrandDto, UpdateBrandDto } from './master.brands.service';
import { JwtOwnerAuthGuard } from 'src/common/guards/jwt-owner.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UploadService } from '../upload/upload.service';
import { MasterService } from '../master/master.service';

@Controller('master/brands')
export class MasterBrandController {
  constructor(
    private readonly brandService: MasterBrandService,
    private readonly masterService: MasterService,
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
  @UploadedFile() file: Express.Multer.File,
) {
  const url = await this.uploadService.uploadFile(file, 'master/brands/logos-light');
  await this.masterService.updateBranding(req.user.userId, { logoLightUrl: url });
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
  @UploadedFile() file: Express.Multer.File,
) {
  const url = await this.uploadService.uploadFile(file, 'master/brands/logos-dark');
  await this.masterService.updateBranding(req.user.userId, { logoDarkUrl: url });
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
  @UploadedFile() file: Express.Multer.File,
) {
  const url = await this.uploadService.uploadFile(file, 'master/brands/favicons');
  await this.masterService.updateBranding(req.user.userId, { faviconUrl: url });
  return { url };
}
}