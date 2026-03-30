import { Module } from '@nestjs/common';
import { SignService } from './sign.service';
import { SignController } from './sign.controller';
import { SignManagementController } from './sign-management.controller';

@Module({
  controllers: [SignController, SignManagementController],
  providers: [SignService],
  exports: [SignService],
})
export class SignModule {}