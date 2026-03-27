import { Module } from '@nestjs/common';
import { MenuGroupsController } from './menu-groups.controller';
import { MenuGroupsService } from './menu-groups.service';

@Module({
  controllers: [MenuGroupsController],
  providers: [MenuGroupsService],
  exports: [MenuGroupsService],
})
export class MenuGroupsModule {}
