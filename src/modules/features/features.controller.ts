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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { FeaturesService } from './features.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { JwtOwnerMultiAuthGuard } from '../../common/guards/jwt-owner-multi.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtOwnerAuthGuard } from 'src/common/guards/jwt-owner.guard';
import { FeaturePermissionsService } from '../../ability/factory/feature-permissions.service';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('features')
export class FeaturesController {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly featurePermissions: FeaturePermissionsService
  ) {}

  /**
   * Extrair token de owner de múltiplas fontes
   */
  private extractOwnerToken(req: Request, authorization?: string): string | undefined {
    const headerToken = (req.headers['owner_token'] as string | undefined)?.trim();
    const cookieToken = (req.cookies?.owner_token as string | undefined)?.trim();
    const bearer = authorization?.replace('Bearer ', '').trim();
    // Priorizar owner_token explícito; se não houver, usar Bearer
    return headerToken || cookieToken || bearer;
  }
  @Public()
  @Post()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  create(
    @Body() createFeatureDto: CreateFeatureDto,
    @Req() req?: Request,
  ) {
    // Se necessário, você pode usar o token para validações adicionais
    return this.featuresService.create(createFeatureDto);
  }

  @Public()
  @Get()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findAll() {
    return this.featuresService.findAll();
  }

  @Get('permissions')
  @Public()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  listFeaturesWithPermissions() {
    return this.featurePermissions.listAllFeaturesWithPermissions();
  }

  @Public()
  @Get('all')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  findAllIncludingInactive(
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    const token = this.extractOwnerToken(req as Request, authorization);
    return this.featuresService.findAllIncludingInactive();
  }

  @Get('key/:key')
  @Public()
  findByKey(@Param('key') key: string) {
    return this.featuresService.findByKey(key);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.featuresService.findOne(id);
  }

  @Public()
  @Patch(':id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  update(
    @Param('id') id: string,
    @Body() updateFeatureDto: UpdateFeatureDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    const token = this.extractOwnerToken(req as Request, authorization);
    return this.featuresService.update(id, updateFeatureDto);
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
    const token = this.extractOwnerToken(req as Request, authorization);
    return this.featuresService.toggleActive(id);
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
    const token = this.extractOwnerToken(req as Request, authorization);
    return this.featuresService.remove(id);
  }
}
