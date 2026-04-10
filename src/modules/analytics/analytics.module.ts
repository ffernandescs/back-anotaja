import { Module } from '@nestjs/common';
import { PageViewsController } from './page-views.controller';
import { PageViewsService } from './page-views.service';

@Module({
  controllers: [PageViewsController],
  providers: [PageViewsService],
  exports: [PageViewsService],
})
export class AnalyticsModule {}
