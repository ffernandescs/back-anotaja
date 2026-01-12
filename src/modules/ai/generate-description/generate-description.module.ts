import { Module } from '@nestjs/common';
import { GenerateDescriptionService } from './generate-description.service';
import { GenerateDescriptionController } from './generate-description.controller';

@Module({
  controllers: [GenerateDescriptionController],
  providers: [GenerateDescriptionService],
})
export class GenerateDescriptionModule {}
