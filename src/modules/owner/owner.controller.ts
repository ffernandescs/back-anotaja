import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Get,
  Query,
  UseGuards,
  Param,
} from '@nestjs/common';
import { OwnerService } from './owner.service';
import { OwnerAuthService } from './owner.auth.service';
import { CreateOwnerDto, VerifyOwnerExistsDto, OwnerLoginDto } from './dto/create-owner.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtOwnerAuthGuard } from 'src/common/guards/jwt-owner.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('owner')
@UsePipes(new ValidationPipe({ transform: true }))
export class OwnerController {
  constructor(
    private readonly ownerService: OwnerService,
    private readonly ownerAuthService: OwnerAuthService,
  ) {}

  @Post('register')
  @Public()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @HttpCode(HttpStatus.CREATED)
  async registerOwner(@Body() createOwnerDto: CreateOwnerDto) {
    return this.ownerService.createOwner(createOwnerDto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async loginOwner(@Body() loginDto: OwnerLoginDto) {
    return this.ownerAuthService.login(loginDto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() body: { refresh_token: string }) {
    return this.ownerAuthService.refreshToken(body.refresh_token);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: { refresh_token: string }) {
    return this.ownerAuthService.logout(body.refresh_token);
  }

  @Post('verify-exists')
  @Public()
  @HttpCode(HttpStatus.OK)
  async verifyOwnerExists(@Body() verifyDto: VerifyOwnerExistsDto) {
    return this.ownerService.verifyOwnerExists(verifyDto);
  }

  @Get('check-availability')
  @Public()
  @HttpCode(HttpStatus.OK)
  async checkFieldAvailability(
    @Query('field') field: 'email' | 'phone' | 'document',
    @Query('value') value: string,
  ) {
    if (!field || !value) {
      return {
        available: false,
        error: 'Informe field e value',
      };
    }

    const verifyDto: VerifyOwnerExistsDto = {};
    verifyDto[field] = value;

    const result = await this.ownerService.verifyOwnerExists(verifyDto);
    
    return {
      available: !result.exists,
      field,
      value,
      conflicts: Object.keys(result.data),
    };
  }

  @Public()
  @Get('companies')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async getAllCompanies() {
    return this.ownerService.findAllCompanies();
  }

  @Public()
  @Get('companies/:id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  async getCompanyById(@Param('id') id: string) {
    return this.ownerService.findCompanyById(id);
  }

  @Get('plans/trial')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getTrialInfo() {
    // Retornar informações do plano trial sem criar
    return {
      name: 'Trial Gratuita',
      description: 'Período experimental de 7 dias para testar a plataforma',
      trialDays: 7,
      limits: {
        users: 2,
        products: 10,
        orders_per_month: 50,
        branches: 1,
      },
      features: [
        'Dashboard completo',
        'Gestão de pedidos',
        'Cadastro de produtos',
        'Gestão de categorias',
        'Clientes básicos',
        'Relatórios simples',
        'Configurações da loja',
      ],
      nextSteps: [
        'Após o trial, escolha um plano pago',
        'Seus dados serão preservados',
        'Sem compromisso ou cartão necessário',
      ],
    };
  }
}
