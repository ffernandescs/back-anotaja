import { Controller, Get, Put, Body, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { GeneralConfigService } from './general-config.service';
import { UpdateGeneralConfigDto } from './dto/general-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('general-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GeneralConfigController {
  constructor(private readonly generalConfigService: GeneralConfigService) {}

  @Get()
  @Roles('admin', 'owner')
  async getConfig(@Request() req) {
    try {
      const branchId = req.user.branchId;
      const config = await this.generalConfigService.findByBranchId(branchId);
      
      // Se não existir configuração, retornar valores padrão
      if (!config) {
        return {
          // Configurações de impressão
          showItemNumber: true,
          showComplementPrice: true,
          showComplementName: true,
          useLargerFontForProduction: true,
          multiplyOptionsByQuantity: false,
          printCompanyLogo: true,
          printCancellationReceipt: false,
          printRatingQRCode: true,
          
          // Configurações de texto
          standardRouteMessage: '',
          tableClosingMessage: '',
          standardRouteQRCode: '',
          tableClosingQRCode: '',
          
          // Outros campos mantidos para compatibilidade
          companyName: '',
          cnpj: '',
          address: '',
          phone: '',
          email: '',
          showTaxInfo: true,
          showCustomerInfo: true,
          showOrderDetails: true,
          showPaymentInfo: true,
          showTimestamp: true,
          headerMessage: '',
          footerMessage: '',
          thankYouMessage: 'Obrigado pela preferência!',
          maxCharactersPerLine: 40,
          fontSize: 'medium',
          printLogo: false,
          logoUrl: '',
          showTaxNumber: true,
          showFiscalInfo: true,
          showOrderNumber: true,
          showTableNumber: true,
        };
      }
      
      return config;
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Put()
  @Roles('admin', 'owner')
  async updateConfig(@Request() req, @Body() updateDto: UpdateGeneralConfigDto) {
    try {
      const branchId = req.user.branchId;
      const config = await this.generalConfigService.upsert(branchId, updateDto);
      
      return {
        message: 'Configurações atualizadas com sucesso',
        config,
      };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
