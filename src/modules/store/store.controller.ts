import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { StoreService } from './store.service';
import { Public } from '../../common/decorators/public.decorator';
import { CreateStoreOrderDto } from './dto/create-store-order.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { CalculateDeliveryFeeDto } from './dto/calculate-delivery-fee.dto';
import { StoreLoginDto } from './dto/store-login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtCustomerAuthGuard } from '../../common/guards/jwt-customer.guard';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto';
import { GetCustomer } from './decorators/get-customer.decorator';

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    email?: string;
    role?: string;
    phone?: string;
  };
}

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  /**
   * Extrair subdomain do hostname ou header
   */
  private extractSubdomain(
    hostname: string,
    xTenant?: string,
  ): { subdomain?: string; branchId?: string } {
    if (xTenant) {
      // Se X-Tenant parece ser um ID válido, usar como branchId
      if (/^[a-zA-Z0-9]{20,}$/.test(xTenant)) {
        return { branchId: xTenant };
      }
      return { subdomain: xTenant };
    }

    const parts = hostname.split('.');
    if (hostname.includes('localhost')) {
      if (parts.length > 1 && parts[0] !== 'localhost') {
        return { subdomain: parts[0] };
      }
    } else if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && parts.length >= 2) {
      const potentialSubdomain = parts[0];
      if (potentialSubdomain !== 'www') {
        return { subdomain: potentialSubdomain };
      }
    }

    return {};
  }

  /**
   * Obter dados completos da homepage (loja + categorias com produtos + pedidos se autenticado)
   * Este é o endpoint otimizado para a tela principal da loja
   */
  @Get('homepage')
  @Public()
  async getHomepage(
    @Query('branchId') branchId?: string,
    @Query('phone') phone?: string,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: RequestWithUser & Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain, branchId: headerBranchId } = this.extractSubdomain(
      hostname,
      xTenant,
    );

    // Tentar obter telefone do usuário autenticado ou do query param
    let customerPhone: string | undefined = phone;

    // Se houver usuário autenticado (mesmo sendo rota pública), usar o telefone dele
    if (req?.user?.userId && !customerPhone) {
      try {
        const finalBranchId = branchId || headerBranchId;
        const userData = await this.storeService.getMe(
          req.user.userId,
          finalBranchId,
        );
        customerPhone = userData.user.phone || undefined;
      } catch {
        // Ignorar erro - usuário pode não estar autenticado ou não ter telefone
      }
    }

    return this.storeService.getHomepage(
      subdomain,
      branchId || headerBranchId,
      customerPhone,
    );
  }

  /**
   * Obter informações básicas da loja
   */
  @Get('info')
  @Public()
  async getInfo(
    @Query('branchId') branchId?: string,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain, branchId: headerBranchId } = this.extractSubdomain(
      hostname,
      xTenant,
    );

    return this.storeService.getInfo(subdomain, branchId || headerBranchId);
  }

  /**
   * Obter categorias da loja
   */
  @Get('categories')
  @Public()
  async getCategories(
    @Query('branchId') branchId?: string,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain, branchId: headerBranchId } = this.extractSubdomain(
      hostname,
      xTenant,
    );

    return this.storeService.getCategories(
      subdomain,
      branchId || headerBranchId,
    );
  }

  /**
   * Obter produtos da loja
   */
  @Get('products')
  @Public()
  async getProducts(
    @Query('branchId') branchId?: string,
    @Query('categoryId') categoryId?: string,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain, branchId: headerBranchId } = this.extractSubdomain(
      hostname,
      xTenant,
    );

    return this.storeService.getProducts(
      subdomain,
      branchId || headerBranchId,
      categoryId,
    );
  }

  /**
   * Criar pedido na loja (checkout)
   */
  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Body() createOrderDto: CreateStoreOrderDto,
    @Query('branchId') branchId?: string,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain, branchId: headerBranchId } = this.extractSubdomain(
      hostname,
      xTenant,
    );

    return await this.storeService.createOrder(
      createOrderDto,
      subdomain,
      branchId || headerBranchId,
    );
  }

  /**
   * Listar pedidos da loja (público, por telefone do cliente)
   */
  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Get('orders')
  async getOrders(
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
    @Query() query?: GetOrdersQueryDto,
    @GetCustomer('id') customerId?: string, // Pega ID do customer do JWT
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain } = this.extractSubdomain(hostname, xTenant);

    return await this.storeService.getOrders(subdomain, query, customerId);
  }

  /**
   * Buscar pedido específico da loja (público)
   */
  @Get('orders/:id')
  @Public()
  async getOrderById(
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain, branchId: headerBranchId } = this.extractSubdomain(
      hostname,
      xTenant,
    );

    return await this.storeService.getOrderById(
      id,
      subdomain,
      branchId || headerBranchId,
    );
  }

  /**
   * Buscar dados do cliente autenticado (user, addresses, orders)
   */
  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  async getMe(
    @Req() req: RequestWithUser,
    @Query('branchId') branchId?: string,
    @Headers('x-tenant') xTenant?: string,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    // Extrair branchId do subdomain/header se não fornecido
    let finalBranchId = branchId;
    if (!finalBranchId) {
      const hostname = req.headers?.host || '';
      const { branchId: headerBranchId } = this.extractSubdomain(
        hostname,
        xTenant,
      );
      finalBranchId = headerBranchId;
    }

    return await this.storeService.getMe(req.user.userId, finalBranchId);
  }

  /**
   * Listar endereços do cliente
   */
  @Get('addresses')
  @UseGuards(JwtAuthGuard)
  async getAddresses(@Req() req: RequestWithUser) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return await this.storeService.getCustomerAddresses(req.user.userId);
  }

  /**
   * Criar endereço do cliente
   */
  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async createAddress(
    @Body() createAddressDto: CreateCustomerAddressDto,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return await this.storeService.createCustomerAddress(
      req.user.userId,
      createAddressDto,
    );
  }

  /**
   * Atualizar endereço do cliente
   */
  @Put('addresses/:id')
  @UseGuards(JwtAuthGuard)
  async updateAddress(
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateCustomerAddressDto,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return await this.storeService.updateCustomerAddress(
      id,
      req.user.userId,
      updateAddressDto,
    );
  }

  /**
   * Deletar endereço do cliente
   */
  @Delete('addresses/:id')
  @UseGuards(JwtAuthGuard)
  async deleteAddress(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return await this.storeService.deleteCustomerAddress(id, req.user.userId);
  }

  /**
   * Calcular frete de entrega (público)
   */
  @Post('delivery-fee')
  @Public()
  async calculateDeliveryFee(
    @Body() calculateFeeDto: CalculateDeliveryFeeDto,
    @Query('branchId') branchId?: string,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain, branchId: headerBranchId } = this.extractSubdomain(
      hostname,
      xTenant,
    );

    return await this.storeService.calculateDeliveryFee(
      calculateFeeDto,
      subdomain,
      branchId || headerBranchId,
    );
  }

  /**
   * Login do cliente na loja (público)
   */
  @Post('auth/login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: StoreLoginDto,
    @Query('branchId') branchId?: string,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain, branchId: headerBranchId } = this.extractSubdomain(
      hostname,
      xTenant,
    );

    return await this.storeService.storeLogin(
      loginDto,
      subdomain,
      branchId || headerBranchId,
    );
  }

  /**
   * Buscar anúncios ativos da loja (público)
   */
  @Get('announcements')
  @Public()
  async getAnnouncements(
    @Query('subdomain') subdomainParam?: string,
    @Query('branchId') branchId?: string,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain: subdomainFromHeader, branchId: headerBranchId } =
      this.extractSubdomain(hostname, xTenant);

    // Usar subdomain do query param ou do header/hostname
    const subdomain = subdomainParam || subdomainFromHeader;

    return await this.storeService.getAnnouncements(
      subdomain,
      branchId || headerBranchId,
    );
  }

  /**
   * Buscar endereço por CEP (público)
   */
  @Get('cep')
  @Public()
  async searchCep(@Query('zipCode') zipCode: string) {
    if (!zipCode) {
      throw new BadRequestException('CEP é obrigatório');
    }
    return await this.storeService.searchCep(zipCode);
  }
}
