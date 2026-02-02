import { Module } from '@nestjs/common';
import { IngredientsService } from './ingredients.service';
import { IngredientsController } from './ingredients.controller';

@Module({
  providers: [IngredientsService],
  controllers: [IngredientsController]
})
export class IngredientsModule {}
