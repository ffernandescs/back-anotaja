// companies.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: CreateCompanyDto) {
    return this.companiesService.createCompany(dto);
  }
}
