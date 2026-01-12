import { Module } from '@nestjs/common';
import { ComplementOptionsService } from './complement-options.service';
import { ComplementOptionsController } from './complement-options.controller';

@Module({
  controllers: [ComplementOptionsController],
  providers: [ComplementOptionsService],
  exports: [ComplementOptionsService],
})
export class ComplementOptionsModule {}
