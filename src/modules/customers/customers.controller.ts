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
  Query,
} from '@nestjs/common';
import type { Request } from 'express';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { Public } from '../../common/decorators/public.decorator';
import { resolveXTenant } from '../../utils/resolve-x-tenant';
import { JwtCustomerAuthGuard } from '../../common/guards/jwt-customer.guard';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { SegmentCustomersDto } from './dto/segment-customers.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { ChangeCustomerPasswordDto } from './dto/change-customer-password.dto';

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
      return resolveXTenant(xTenant);
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

  @Post('admin-create')
  async adminCreate(
    @Body() dto: CreateCustomerDto,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.adminCreate(dto, req.user.userId);
  }

  @Get()
  findAll(@Query() query: QueryCustomersDto, @Req() req: RequestWithUser) {
    return this.customersService.findAll(req.user.userId, query);
  }

  @Post('segment')
  segmentForCampaign(@Body() dto: SegmentCustomersDto, @Req() req: RequestWithUser) {
    return this.customersService.segmentForCampaign(req.user.userId, dto);
  }

  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Get('me')
  async getMe(@Req() req: RequestWithUser) {
    return this.customersService.getCustomerById(req.user.userId);
  }

  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Patch('me')
  async updateMe(
    @Req() req: RequestWithUser,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.customersService.updateProfile(req.user.userId, dto);
  }

  @Public()
  @UseGuards(JwtCustomerAuthGuard)
  @Patch('me/password')
  async changeMyPassword(
    @Req() req: RequestWithUser,
    @Body() dto: ChangeCustomerPasswordDto,
  ) {
    return this.customersService.changePassword(req.user.userId, dto);
  }

  @Get('addresses-admin')
  async getAllAddressesAdmin(@Req() req: RequestWithUser) {
    return this.customersService.findAllCustomerAddresses(req.user.userId);
  }

  @Get(':customerId/addresses')
  @UseGuards(JwtAuthGuard)
  async getCustomerAddresses(@Param('customerId') customerId: string) {
    return this.customersService.findAllCustomerAddresses(customerId);
  }

  @Post('addresses-admin')
  async createAddressAdmin(
    @Body() dto: CreateCustomerAddressDto,
    @Req() req: RequestWithUser,
  ) {
    // dto.customerId vem do body (admin criando endereço para um cliente)
    const customerId = dto.customerId || req.user.userId;
    return this.customersService.createAddressCustomer(dto, customerId);
  }

  @Put('addresses-admin/:id')
  async updateAddressAdmin(
    @Param('id') id: string,
    @Body() dto: CreateCustomerAddressDto,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.updateAddressCustomer(id, dto, req.user.userId);
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
    const { subdomain, branchId } = this.extractSubdomain(hostname, xTenant);
    return this.customersService.login(dto, subdomain, branchId);
  }

  @Get('for-campaign')
  async getForCampaign(@Req() req: RequestWithUser) {
    return this.customersService.getForCampaign(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.customersService.findOne(id, req.user.userId);
  }

  @Get(':id/metrics')
  getMetrics(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.customersService.getCustomerMetrics(id, req.user.userId);
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
