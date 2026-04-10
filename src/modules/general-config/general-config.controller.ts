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
          printCancellationReceipt: false,
          printRatingQRCode: true,
          
          // Configurações de texto
          standardRouteMessage: '',
          tableClosingMessage: '',
          standardRouteQRCode: '',
          tableClosingQRCode: '',

          // Configurações de taxa de serviço
          enableServiceFee: false,
          serviceFeePercentage: 10,

          // Configurações de tipos de pedido
          enableDelivery: true,
          enableDineIn: true,
          enablePickup: true,
        };
      }
      
      return config;
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Put()
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
