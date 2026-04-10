import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    branchId?: string;
    role?: string;
  };
}

@Controller('performance')
@UseGuards(JwtAuthGuard)
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Get('sales')
  async getSalesReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user.userId;
    return this.performanceService.getSalesReport(
      userId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('customers')
  async getCustomerReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user.userId;
    return this.performanceService.getCustomerReport(
      userId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('customers/orders')
  async getCustomersWithOrdersInPeriod(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: RequestWithUser,
    @Query('search') search?: string,
  ) {
    const userId = req.user.userId;
    return this.performanceService.getCustomersWithOrdersInPeriod(
      userId,
      new Date(startDate),
      new Date(endDate),
      search,
    );
  }
}
