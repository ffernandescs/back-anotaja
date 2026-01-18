// companies.controller.ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

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
  constructor(private readonly companiesService: CompaniesService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: CreateCompanyDto) {
    return this.companiesService.createCompany(dto);
  }

  @Roles('admin', 'manager')
  @Get('onboarding-status')
  async getOnboardingStatus(@Req() req: RequestWithUser) {
    return this.companiesService.getOnboardingStatus(req.user.userId);
  }

  @Post('onboarding/complete')
  @Roles('admin', 'manager')
  completeOnboarding(@Req() req: RequestWithUser) {
    return this.companiesService.completeOnboarding(req.user.userId);
  }
}
