import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  controllers: [UsersController, GroupsController],
  providers: [UsersService, GroupsService],
  exports: [UsersService, GroupsService],
})
export class UsersModule {}
