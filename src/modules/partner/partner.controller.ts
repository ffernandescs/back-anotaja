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
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreatePartnerCustomerDto } from './dto/create-partner-customer.dto';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { UpdatePartnerCustomerDto } from './dto/update-partner-customer.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PartnerService } from './partner.service';
import { JwtPartnerAuthGuard } from 'src/common/guards/jwt-partner.guard';

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

  @Get('me/referral-link')
  @UseGuards(JwtPartnerAuthGuard)
  async getMyReferralLink(@Request() req) {
    return this.partnerService.getPartnerReferralLink(req.user.partnerId);
  }

  @Put('me')
  @UseGuards(JwtPartnerAuthGuard)
  async updateMyProfile(@Request() req, @Body() dto: UpdatePartnerDto) {
    return this.partnerService.updatePartner(req.user.partnerId, dto);
  }

  @Put('me/password')
  @UseGuards(JwtPartnerAuthGuard)
  async updateMyPassword(@Request() req, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.partnerService.updatePartnerPassword(req.user.partnerId, body.currentPassword, body.newPassword);
  }

  @Get('me/customers')
  @UseGuards(JwtPartnerAuthGuard)
  async getMyCustomers(
    @Request() req,
    @Query('hasSubscription') hasSubscription?: boolean,
  ) {
    return this.partnerService.getCustomersByPartner(req.user.partnerId, hasSubscription);
  }

  @Post('me/customers')
  @UseGuards(JwtPartnerAuthGuard)
  async createMyCustomer(@Request() req, @Body() dto: CreatePartnerCustomerDto) {
    return this.partnerService.createCustomer(req.user.partnerId, dto);
  }

  @Post('me/customers/import')
  @UseGuards(JwtPartnerAuthGuard)
  async importMyCustomers(@Request() req, @Body() dto: ImportCustomersDto) {
    return this.partnerService.importCustomersFromCsv(req.user.partnerId, dto);
  }

  @Put('customers/:id/toggle-subscription')
  @UseGuards(JwtPartnerAuthGuard)
  async toggleCustomerSubscription(@Request() req, @Param('id') id: string) {
    return this.partnerService.toggleCustomerSubscription(id, req.user.partnerId);
  }

  @Delete('customers/:id')
  @UseGuards(JwtPartnerAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCustomer(@Request() req, @Param('id') id: string) {
    return this.partnerService.deleteCustomer(id, req.user.partnerId);
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

  @Get('me/companies')
  @UseGuards(JwtPartnerAuthGuard)
  async getMyCompanies(@Request() req) {
    return this.partnerService.getPartnerCompanies(req.user.partnerId);
  }

  @Get('me/plans')
  @UseGuards(JwtPartnerAuthGuard)
  async getAvailablePlans() {
    return this.partnerService.getAvailablePlans();
  }

  @Post('me/companies/:companyId/activate')
  @UseGuards(JwtPartnerAuthGuard)
  async activateMyCompany(@Param('companyId') companyId: string, @Body() body: { planId?: string; withTrial?: boolean }, @Request() req) {
    return this.partnerService.activateClient(companyId, req.user.partnerId, body.planId, body.withTrial);
  }

  @Post('me/companies/:companyId/resend-credentials')
  @UseGuards(JwtPartnerAuthGuard)
  async resendCredentials(@Param('companyId') companyId: string, @Request() req) {
    return this.partnerService.resendCredentials(companyId, req.user.partnerId);
  }

  @Public()
  @Get(':id/companies')
  @UseGuards(JwtAuthGuard)
  async getPartnerCompanies(@Param('id') id: string) {
    return this.partnerService.getPartnerCompanies(id);
  }

  // ─── Partner Customer Endpoints (Partner Dashboard) ─────────

  @Public()
  @Post(':partnerId/customers')
  @UseGuards(JwtAuthGuard)
  async createCustomer(
    @Param('partnerId') partnerId: string,
    @Body() dto: CreatePartnerCustomerDto,
  ) {
    return this.partnerService.createCustomer(partnerId, dto);
  }

  @Public()
  @Get(':partnerId/customers')
  @UseGuards(JwtAuthGuard)
  async getCustomersByPartner(
    @Param('partnerId') partnerId: string,
    @Query('hasSubscription') hasSubscription?: boolean,
  ) {
    return this.partnerService.getCustomersByPartner(partnerId, hasSubscription);
  }

  @Public()
  @Get('customers/:id')
  @UseGuards(JwtAuthGuard)
  async getCustomerById(@Param('id') id: string) {
    return this.partnerService.getCustomerById(id);
  }

  @Public()
  @Put('customers/:id')
  @UseGuards(JwtAuthGuard)
  async updateCustomer(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerCustomerDto,
  ) {
    return this.partnerService.updateCustomer(id, dto);
  }

  @Public()
  @Post(':partnerId/customers/import')
  @UseGuards(JwtAuthGuard)
  async importCustomersFromCsv(
    @Param('partnerId') partnerId: string,
    @Body() dto: ImportCustomersDto,
  ) {
    return this.partnerService.importCustomersFromCsv(partnerId, dto);
  }
}
