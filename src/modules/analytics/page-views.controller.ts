import { Controller, Post, Body, Get, Query, Req, Headers, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PageViewsService } from './page-views.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface RequestWithUser extends Request {
  user?: {
    userId?: string;
    email?: string;
    role?: string;
  };
}

@Controller('analytics')
export class PageViewsController {
  constructor(private readonly pageViewsService: PageViewsService) {}

  private extractSubdomain(
    hostname: string,
    xTenant?: string,
  ): { subdomain?: string; branchId?: string } {
    if (xTenant) {
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

  @Public()
  @Post('page-views')
  async trackPageView(
    @Body() body: { page: string; url?: string; visitorId?: string; userAgent?: string; referer?: string },
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: RequestWithUser & Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain } = this.extractSubdomain(hostname, xTenant);
    return this.pageViewsService.trackPageView(body, subdomain);
  }

  @UseGuards(JwtAuthGuard)
  @Get('page-views')
  async getPageViews(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('groupBy') groupBy: 'hour' | 'day' = 'day',
    @Headers('x-tenant') xTenant?: string,
    @Req() req?: RequestWithUser & Request,
  ) {
    const hostname = req?.headers?.host || '';
    const { subdomain } = this.extractSubdomain(hostname, xTenant);
    return this.pageViewsService.getPageViews(req?.user?.userId, subdomain, new Date(startDate), new Date(endDate), groupBy);
  }
}
