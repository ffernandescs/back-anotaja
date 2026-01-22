import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  Headers,
  Put,
} from '@nestjs/common';
import type { Request } from 'express';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { JwtCustomerAuthGuard } from 'src/common/guards/jwt-customer.guard';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

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

  @Post('create')
  @Public()
  async create(
    @Body() dto: CreateCustomerDto,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: Request,
  ) {
    const hostname = req?.headers?.host || '';
    const subdomain = xTenant || hostname.split('.')[0]; // pega o subdomain

    return this.customersService.create(dto, subdomain);
  }

  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.customersService.findAll(req.user.userId);
  }

  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Get('me')
  async getMe(@Req() req: RequestWithUser) {
    return this.customersService.getCustomerById(req.user.userId);
  }

  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Get('addresses')
  async getAllAddresses(@Req() req: RequestWithUser) {
    return this.customersService.findAllCustomerAddresses(req.user.userId);
  }

  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Post('addresses')
  async createAddress(
    @Body() dto: CreateCustomerAddressDto,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.createAddressCustomer(dto, req.user.userId);
  }

  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Put('addresses/:id')
  async updateAddress(
    @Param('id') id: string,
    @Body() dto: CreateCustomerAddressDto,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.updateAddressCustomer(
      id,
      dto,
      req.user.userId,
    );
  }

  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Delete('addresses/:id')
  async deleteAddress(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.customersService.deleteAddressCustomer(req.user.userId, id);
  }

  @Post('login')
  @Public()
  async login(
    @Body() dto: LoginCustomerDto,
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: RequestWithUser & Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain } = this.extractSubdomain(hostname, xTenant);
    return this.customersService.login(dto, subdomain);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.customersService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.customersService.remove(id, req.user.userId);
  }

  @Patch(':customerId/address/:addressId/default')
  setDefaultAddress(
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.setDefaultAddress(
      customerId,
      addressId,
      req.user.userId,
    );
  }
}
