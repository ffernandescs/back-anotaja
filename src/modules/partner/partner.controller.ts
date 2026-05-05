import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { JwtOwnerAuthGuard } from 'src/common/guards/jwt-owner.guard';
import { JwtPartnerAuthGuard } from 'src/common/guards/jwt-partner.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreatePartnerCustomerDto } from './dto/create-partner-customer.dto';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { UpdatePartnerCustomerDto } from './dto/update-partner-customer.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PartnerService } from './partner.service';

@Controller('partners')
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  // ─── Authentication ─────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }) {
    return this.partnerService.login(body.email, body.password);
  }

  @Public()
  @Get('me')
  @UseGuards(JwtPartnerAuthGuard)
  async getCurrentPartner(@Request() req) {
    return this.partnerService.getPartnerById(req.user.partnerId);
  }

  @Public()
  @Get('me/referral-link')
  @UseGuards(JwtPartnerAuthGuard)
  async getMyReferralLink(@Request() req) {
    return this.partnerService.getPartnerReferralLink(req.user.partnerId);
  }

  @Public()
  @Put('me')
  @UseGuards(JwtPartnerAuthGuard)
  async updateMyProfile(@Request() req, @Body() dto: UpdatePartnerDto) {
    return this.partnerService.updatePartner(req.user.partnerId, dto);
  }

  @Public()
  @Put('me/password')
  @UseGuards(JwtPartnerAuthGuard)
  async updateMyPassword(@Request() req, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.partnerService.updatePartnerPassword(req.user.partnerId, body.currentPassword, body.newPassword);
  }

  @Public()
  @Get('me/customers')
  @UseGuards(JwtPartnerAuthGuard)
  async getMyCustomers(
    @Request() req,
    @Query('hasSubscription') hasSubscription?: boolean,
  ) {
    return this.partnerService.getCustomersByPartner(req.user.partnerId, hasSubscription);
  }

  @Public()
  @Post('me/customers')
  @UseGuards(JwtPartnerAuthGuard)
  async createMyCustomer(@Request() req, @Body() dto: CreatePartnerCustomerDto) {
    return this.partnerService.createCustomer(req.user.partnerId, dto);
  }

  @Public()
  @Post('me/customers/import')
  @UseGuards(JwtPartnerAuthGuard)
  async importMyCustomers(@Request() req, @Body() dto: ImportCustomersDto) {
    return this.partnerService.importCustomersFromCsv(req.user.partnerId, dto);
  }

  @Public()
  @Put('customers/:id/toggle-subscription')
  @UseGuards(JwtPartnerAuthGuard)
  async toggleCustomerSubscription(@Param('id') id: string) {
    return this.partnerService.toggleCustomerSubscription(id);
  }

  @Public()
  @Delete('customers/:id')
  @UseGuards(JwtPartnerAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCustomer(@Param('id') id: string) {
    return this.partnerService.deleteCustomer(id);
  }

  // ─── Partner Endpoints (Master Admin) ─────────────────────

  @Public()
  @Post()
  @UseGuards(JwtOwnerAuthGuard, RolesGuard)
  async createPartner(@Body() dto: CreatePartnerDto) {
    return this.partnerService.createPartner(dto);
  }

  @Public()
  @Get()
  @UseGuards(JwtOwnerAuthGuard, RolesGuard)
  async getAllPartners() {
    return this.partnerService.getAllPartners();
  }

  @Public()
  @Get(':id')
  @UseGuards(JwtOwnerAuthGuard, RolesGuard)
  async getPartnerById(@Param('id') id: string) {
    return this.partnerService.getPartnerById(id);
  }

  @Public()
  @Put(':id')
  @UseGuards(JwtOwnerAuthGuard, RolesGuard)
  async updatePartner(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnerService.updatePartner(id, dto);
  }

  @Public()
  @Delete(':id')
  @UseGuards(JwtOwnerAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePartner(@Param('id') id: string) {
    return this.partnerService.deletePartner(id);
  }

  @Public()
  @Put(':id/toggle-active')
  @UseGuards(JwtOwnerAuthGuard, RolesGuard)
  async togglePartnerActive(@Param('id') id: string) {
    return this.partnerService.togglePartnerActive(id);
  }

  @Public()
  @Post(':id/generate-code')
  @UseGuards(JwtOwnerAuthGuard, RolesGuard)
  async generatePartnerCode(@Param('id') id: string) {
    return this.partnerService.generatePartnerCode(id);
  }

  @Public()
  @Get('code/:code')
  async getPartnerByCode(@Param('code') code: string) {
    return this.partnerService.getPartnerByCode(code);
  }

  @Public()
  @Get('me/companies')
  @UseGuards(JwtPartnerAuthGuard)
  async getMyCompanies(@Request() req) {
    return this.partnerService.getPartnerCompanies(req.user.partnerId);
  }

  @Get(':id/companies')
  @UseGuards(JwtPartnerAuthGuard)
  async getPartnerCompanies(@Param('id') id: string) {
    return this.partnerService.getPartnerCompanies(id);
  }

  // ─── Partner Customer Endpoints (Partner Dashboard) ─────────

  @Post(':partnerId/customers')
  @UseGuards(JwtPartnerAuthGuard)
  async createCustomer(
    @Param('partnerId') partnerId: string,
    @Body() dto: CreatePartnerCustomerDto,
  ) {
    return this.partnerService.createCustomer(partnerId, dto);
  }

  @Get(':partnerId/customers')
  @UseGuards(JwtPartnerAuthGuard)
  async getCustomersByPartner(
    @Param('partnerId') partnerId: string,
    @Query('hasSubscription') hasSubscription?: boolean,
  ) {
    return this.partnerService.getCustomersByPartner(partnerId, hasSubscription);
  }

  @Get('customers/:id')
  @UseGuards(JwtPartnerAuthGuard)
  async getCustomerById(@Param('id') id: string) {
    return this.partnerService.getCustomerById(id);
  }

  @Put('customers/:id')
  @UseGuards(JwtPartnerAuthGuard)
  async updateCustomer(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerCustomerDto,
  ) {
    return this.partnerService.updateCustomer(id, dto);
  }

  @Post(':partnerId/customers/import')
  @UseGuards(JwtPartnerAuthGuard)
  async importCustomersFromCsv(
    @Param('partnerId') partnerId: string,
    @Body() dto: ImportCustomersDto,
  ) {
    return this.partnerService.importCustomersFromCsv(partnerId, dto);
  }
}
