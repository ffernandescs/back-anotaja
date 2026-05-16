// whatsapp.controller.ts — topo do arquivo, substitua os imports existentes

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Request,
  Req,           // ← adicionar
  Res,           // ← já estava no seu import original? confirme
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Query,
  Logger,
  Param,        // ← adicionar
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response as ExpressResponse } from 'express'; // ← import correto do Express
import { Request as ExpressRequest } from 'express';   // ← para tipar o req do proxy
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';
import {
  UpdateWhatsAppConfigDto,
  SendTestMessageDto,
  FetchMessagesDto,
  SendCrmMessageDto,
  CreateMessageTemplateDto,
  UpdateMessageTemplateDto,
  CreateCampaignRecordDto,
  CreateOrderOriginDto,
  UpdateOrderOriginDto,
  SuggestOrderOriginCodeDto,
} from './dto/whatsapp.dto';
import {
  BulkCreateOrderChannelCampaignsDto,
  CreateOrderChannelCampaignDto,
  QueryOrderChannelCampaignMessagesDto,
  QueryOrderChannelCampaignOrdersDto,
  UpdateOrderChannelCampaignDto,
} from './dto/order-channel-campaign.dto';

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);
  constructor(private readonly whatsappService: WhatsAppService) {}

  @UseGuards(JwtAuthGuard)
  @Get('config')
  async getConfig(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.getConfig(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Put('config')
  async updateConfig(@Request() req, @Body() dto: UpdateWhatsAppConfigDto) {
    try {
      const branchId = req.user.branchId;
      const config = await this.whatsappService.updateConfig(branchId, dto);
      return { message: 'Configuracoes atualizadas com sucesso', config };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('setup')
  async setupPartner(@Request() req) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;

      if (!branchId && !partnerId) {
        throw new BadRequestException('branchId ou partnerId é necessário');
      }

      if (branchId) {
        return this.whatsappService.setup(branchId);
      } else {
        return this.whatsappService.setupPartner(partnerId);
      }
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect')
  async connect(@Request() req) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;

      if (!branchId && !partnerId) {
        throw new BadRequestException('branchId ou partnerId é necessário');
      }

      return this.whatsappService.connect(branchId, partnerId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  async disconnect(@Request() req) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;

      if (!branchId && !partnerId) {
        throw new BadRequestException('branchId ou partnerId é necessário');
      }

      return this.whatsappService.disconnect(branchId, partnerId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@Request() req) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;


      if (!branchId && !partnerId) {
        throw new BadRequestException('branchId ou partnerId é necessário');
      }

      return this.whatsappService.getStatus(branchId, partnerId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('test')
  async sendTestMessage(@Request() req, @Body() dto: SendTestMessageDto) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.sendTestMessage(branchId, dto);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  // ─── CRM Endpoints ──────────────────────────────────────────────

 @Get('crm/chats')
  async fetchChats(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const branchId = req.user.branchId;

      return this.whatsappService.fetchChats(
        branchId,
      );
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('crm/messages')
  async fetchMessages(@Request() req, @Body() dto: FetchMessagesDto) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.fetchMessages(branchId, dto);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('crm/send')
  async sendCrmMessage(@Request() req, @Body() dto: SendCrmMessageDto) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.sendCrmMessage(branchId, dto);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-bulk')
  async sendBulkMessages(
    @Request() req,
    @Body()
    dto: {
      phones: Array<{ phone: string; name?: string; segment?: string; customerId?: string }>;
      message: string;
    },
  ) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;

      if (!branchId && !partnerId) {
        throw new BadRequestException('branchId ou partnerId é necessário');
      }

      return this.whatsappService.sendBulkMessages(dto.phones, dto.message, branchId, partnerId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('messages/history/:phone')
  async getMessageHistory(
    @Request() req,
    @Param('phone') phone: string,
  ) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;

      if (!branchId && !partnerId) {
        throw new BadRequestException('branchId ou partnerId é necessário');
      }

      return this.whatsappService.getMessageHistoryByPhone(phone, partnerId, branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('messages/check-duplicate')
  async checkDuplicateMessage(
    @Request() req,
    @Body()
    dto: {
      phone: string;
      message: string;
    },
  ) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;

      if (!branchId && !partnerId) {
        throw new BadRequestException('branchId ou partnerId é necessário');
      }

      const isDuplicate = await this.whatsappService.checkDuplicateMessage(dto.phone, dto.message, partnerId, branchId);
      return { isDuplicate };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
  @Post('crm/send-media')
  @UseInterceptors(FileInterceptor('file'))
  async sendCrmMedia(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { jid: string; caption?: string },
  ) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.sendCrmMedia(branchId, body.jid, file, body.caption);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Public()
  @Get('crm/media-proxy')
  async mediaProxy(
    @Query('url') mediaUrl: string,
    @Query('messageId') messageId: string,
    @Query('jid') jid: string,
    @Query('branchId') branchId: string,
    @Res() res: ExpressResponse,
  ) {
    try {

      if (!branchId) {
        return res.status(400).json({ error: 'branchId é obrigatório' });
      }

      const config = await this.whatsappService.getFullConfigPublic(branchId);

      if (!config?.instanceName) {
        return res.status(404).json({ error: 'Configuração não encontrada' });
      }


      const evolutionUrl = `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${config.instanceName}`;

      const requestBody = {
        message: { key: { id: messageId, remoteJid: jid } },
        convertToMp4: false,
      };

      const base64Result = await fetch(evolutionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.EVOLUTION_API_KEY!,
        } as HeadersInit,
        body: JSON.stringify(requestBody),
      });


      if (!base64Result.ok) {
        const errorText = await base64Result.text();
      
        return res.status(502).json({ error: 'Falha ao obter mídia da Evolution API' });
      }

      const data = await base64Result.json();

      const base64 = data?.base64 || data?.data;
      const mimetype = data?.mimetype || 'audio/ogg';

      if (!base64) {
        return res.status(502).json({ error: 'Mídia não encontrada' });
      }

      const buffer = Buffer.from(base64, 'base64');
      res.setHeader('Content-Type', mimetype);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.send(buffer);

    } catch (err) {
      return res.status(502).json({ error: 'Falha ao obter mídia' });
    }
  }

  @Post('crm/mark-as-read')
  async markChatAsRead(@Request() req, @Body() body: { jid: string }) {
    try {
      const branchId = req.user.branchId;
      const partnerId = req.user.partnerId;

      if (!branchId && !partnerId) {
        throw new BadRequestException('branchId ou partnerId é necessário');
      }

      // Partners use partnerId, admins use branchId
      return this.whatsappService.markChatAsRead(branchId, partnerId, body.jid);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('crm/mark-as-unread')
  async markChatAsUnread(@Request() req, @Body() body: { jid: string }) {
    try {
      const branchId = req.user.branchId;
      const partnerId = req.user.partnerId;

      if (!branchId && !partnerId) {
        throw new BadRequestException('branchId ou partnerId é necessário');
      }

      return this.whatsappService.markChatAsUnread(branchId, partnerId, body.jid);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('crm/webhook/register')
  async registerWebhook(@Request() req, @Body() body: { webhookUrl: string }) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.registerWebhook(branchId, body.webhookUrl);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  // ─── Templates ─────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('templates')
  async getTemplates(@Request() req) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;
      return this.whatsappService.getTemplates(branchId, partnerId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('templates')
  async createTemplate(@Request() req, @Body() dto: CreateMessageTemplateDto) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;
      return this.whatsappService.createTemplate(dto, branchId, partnerId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Put('templates/:id')
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateMessageTemplateDto) {
    try {
      return this.whatsappService.updateTemplate(id, dto);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    try {
      return this.whatsappService.deleteTemplate(id);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  // ─── Campaigns ─────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('campaigns')
  async getCampaigns(@Request() req) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;
      return this.whatsappService.getCampaigns(branchId, partnerId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('campaigns')
  async createCampaign(@Request() req, @Body() dto: CreateCampaignRecordDto) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;
      return this.whatsappService.createCampaign(dto, branchId, partnerId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  // ─── Origens de pedido ─────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('order-origins')
  async getOrderOrigins(@Request() req) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.getOrderOrigins(branchId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('order-origins/suggest-code')
  async suggestOrderOriginCode(@Request() req, @Body() dto: SuggestOrderOriginCodeDto) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.suggestOrderOriginCode(branchId, dto.name);
  }

  @UseGuards(JwtAuthGuard)
  @Post('order-origins')
  async createOrderOrigin(@Request() req, @Body() dto: CreateOrderOriginDto) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.createOrderOrigin(branchId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('order-origins/:id')
  async updateOrderOrigin(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateOrderOriginDto,
  ) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.updateOrderOrigin(branchId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('order-origins/:id')
  async deleteOrderOrigin(@Request() req, @Param('id') id: string) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.deleteOrderOrigin(branchId, id);
  }

  // ─── Campanhas de links de pedido ──────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('order-campaigns')
  async getOrderChannelCampaigns(@Request() req) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.getOrderChannelCampaigns(branchId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('order-campaigns')
  async createOrderChannelCampaign(@Request() req, @Body() dto: CreateOrderChannelCampaignDto) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.createOrderChannelCampaign(branchId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('order-campaigns/bulk')
  async bulkCreateOrderChannelCampaigns(
    @Request() req,
    @Body() dto: BulkCreateOrderChannelCampaignsDto,
  ) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.bulkCreateOrderChannelCampaigns(branchId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('order-campaigns/:id/dashboard')
  async getOrderChannelCampaignDashboard(@Request() req, @Param('id') id: string) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.getOrderChannelCampaignDashboard(branchId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('order-campaigns/:id/orders')
  async getOrderChannelCampaignOrders(
    @Request() req,
    @Param('id') id: string,
    @Query() query: QueryOrderChannelCampaignOrdersDto,
  ) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.getOrderChannelCampaignOrders(branchId, id, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('order-campaigns/:id/messages')
  async getOrderChannelCampaignMessages(
    @Request() req,
    @Param('id') id: string,
    @Query() query: QueryOrderChannelCampaignMessagesDto,
  ) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.getOrderChannelCampaignMessages(branchId, id, query);
  }

  @UseGuards(JwtAuthGuard)
  @Put('order-campaigns/:id')
  async updateOrderChannelCampaign(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateOrderChannelCampaignDto,
  ) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.updateOrderChannelCampaign(branchId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('order-campaigns/:id')
  async deleteOrderChannelCampaign(@Request() req, @Param('id') id: string) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new BadRequestException('Filial não identificada');
    return this.whatsappService.deleteOrderChannelCampaign(branchId, id);
  }
}