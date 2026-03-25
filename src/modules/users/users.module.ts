import { GroupsController } from './groups.controller';
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController, GroupsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
