import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { GenerateDescriptionDto } from './dto/generate-description.dto';
import { GeneratePrinterMessageDto } from './dto/generate-printer-message.dto';
import { GenerateWhatsAppTemplateDto } from './dto/generate-whatsapp-template.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-description')
  
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

  @Post('generate-printer-message')
  
  async generatePrinterMessage(
    @Body() generatePrinterMessageDto: GeneratePrinterMessageDto,
  ) {
    const message = await this.aiService.generatePrinterMessage(
      generatePrinterMessageDto.type,
    );

    return {
      type: generatePrinterMessageDto.type,
      message,
    };
  }

  @Post('generate-qrcode-message')
  
  async generateQRCodeMessage(
    @Body() generatePrinterMessageDto: GeneratePrinterMessageDto,
  ) {
    const url = await this.aiService.generateQRCodeMessage(
      generatePrinterMessageDto.type,
    );

    return {
      type: generatePrinterMessageDto.type,
      url,
    };
  }

  @Post('generate-whatsapp-template')
  
  async generateWhatsAppTemplate(
    @Body() generateWhatsAppTemplateDto: GenerateWhatsAppTemplateDto,
  ) {
    const template = await this.aiService.generateWhatsAppTemplate(
      generateWhatsAppTemplateDto.type,
    );

    return {
      type: generateWhatsAppTemplateDto.type,
      template,
    };
  }
}
