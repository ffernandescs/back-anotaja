// companies.controller.ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CompaniesService, VerifyCompanyExistDto } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CompanyInterestDto } from './dto/company-interest.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { CompanyOwnerService } from './owner.service';
import { Public } from '../../common/decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly companyOwnerService: CompanyOwnerService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() dto: CreateCompanyDto) {
    return this.companiesService.createCompany(dto);
  }

  @Public()
  @Post('register-interest')
  async registerInterest(@Body() dto: CompanyInterestDto) {
    return this.companiesService.registerCompanyInterest(dto);
  }

  /** Cadastro self-service: empresa + trial 7 dias + usuário dono + login */
  @Public()
  @Post('signup')
  async signup(@Body() dto: CreateOwnerDto) {
    return this.companyOwnerService.createOwnerWithCompany(dto);
  }

  
  @Get('onboarding-status')
  async getOnboardingStatus(@Req() req: RequestWithUser) {
    return this.companiesService.getOnboardingStatus(req.user.userId);
  }

  @Post('onboarding/complete')
  
  completeOnboarding(@Req() req: RequestWithUser) {
    return this.companiesService.completeOnboarding(req.user.userId);
  }

  @Public()
  @Post('owner/verify-exists')
  async verifyOwnerExists(
    @Body() body: { email?: string; phone?: string; document?: string },
  ) {
    return this.companyOwnerService.verifyOwnerExists({
      email: body.email,
      phone: body.phone,
      document: body.document,
    });
  }

  @Post('verify-exists')
  @Public()
  verifyExists(
    @Body() body: { email?: string; phone?: string; document?: string },
  ) {
    return this.companiesService.verifyCompanyExist(body);
  }
}
