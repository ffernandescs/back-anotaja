import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { GenerateDescriptionDto } from './dto/generate-description.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-description')
  @Roles('admin', 'manager')
  async generateDescription(
    @Body() generateDescriptionDto: GenerateDescriptionDto,
  ) {
    const description = await this.aiService.generateDescription(
      generateDescriptionDto.name,
    );

    return {
      name: generateDescriptionDto.name,
      description,
    };
  }

  @Post('generate-category-description')
  @Roles('admin', 'manager')
  async generateCategoryDescription(
    @Body() generateDescriptionDto: GenerateDescriptionDto,
  ) {
    const description = await this.aiService.generateCategoryDescription(
      generateDescriptionDto.name,
    );

    return {
      name: generateDescriptionDto.name,
      description,
    };
  }
}
