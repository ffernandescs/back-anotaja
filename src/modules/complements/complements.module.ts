import { Module } from '@nestjs/common';
import { ComplementsService } from './complements.service';
import { ComplementsController } from './complements.controller';

@Module({
  controllers: [ComplementsController],
  providers: [ComplementsService],
  exports: [ComplementsService],
})
export class ComplementsModule {}
