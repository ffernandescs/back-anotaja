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
import { JwtPartnerAuthGuard } from '../../common/guards/jwt-partner.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator'; // ← adicionar
import {
  UpdateWhatsAppConfigDto,
  SendTestMessageDto,
  FetchMessagesDto,
  SendCrmMessageDto,
  CreateMessageTemplateDto,
  UpdateMessageTemplateDto,
  CreateCampaignRecordDto,
} from './dto/whatsapp.dto';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);
  constructor(private readonly whatsappService: WhatsAppService) {}

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

  @Post('setup')
  async setup(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.setup(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('enable-sync-history')
  async enableSyncHistory(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.enableSyncHistory(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
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

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
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

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
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
  async fetchChats(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.fetchChats(branchId);
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

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
  @Post('send-bulk')
  async sendBulkMessages(
    @Request() req,
    @Body()
    dto: {
      phones: Array<{ phone: string; name?: string; segment?: string }>;
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
      this.logger.log('[media-proxy] Request received:', { messageId, jid, branchId, mediaUrl });

      if (!branchId) {
        this.logger.error('[media-proxy] No branchId provided in request');
        return res.status(400).json({ error: 'branchId é obrigatório' });
      }

      const config = await this.whatsappService.getFullConfigPublic(branchId);

      if (!config?.instanceName) {
        this.logger.error('[media-proxy] No instance config found for branchId:', branchId);
        return res.status(404).json({ error: 'Configuração não encontrada' });
      }

      this.logger.log('[media-proxy] Using instance:', config.instanceName);

      const evolutionUrl = `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${config.instanceName}`;
      this.logger.log('[media-proxy] Calling Evolution API:', evolutionUrl);

      const requestBody = {
        message: { key: { id: messageId, remoteJid: jid } },
        convertToMp4: false,
      };
      this.logger.log('[media-proxy] Request body:', JSON.stringify(requestBody));

      const base64Result = await fetch(evolutionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.EVOLUTION_API_KEY!,
        } as HeadersInit,
        body: JSON.stringify(requestBody),
      });

      this.logger.log('[media-proxy] Evolution API response status:', base64Result.status);

      if (!base64Result.ok) {
        const errorText = await base64Result.text();
        this.logger.error('[media-proxy] Evolution API failed:', {
          status: base64Result.status,
          error: errorText,
        });
        return res.status(502).json({ error: 'Falha ao obter mídia da Evolution API' });
      }

      const data = await base64Result.json();
      this.logger.log('[media-proxy] Evolution API response keys:', Object.keys(data));

      const base64 = data?.base64 || data?.data;
      const mimetype = data?.mimetype || 'audio/ogg';

      if (!base64) {
        this.logger.error('[media-proxy] No base64 data in response. Full response:', JSON.stringify(data));
        return res.status(502).json({ error: 'Mídia não encontrada' });
      }

      const buffer = Buffer.from(base64, 'base64');
      res.setHeader('Content-Type', mimetype);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      this.logger.log('[media-proxy] Successfully returning media:', { mimetype, size: buffer.length });
      return res.send(buffer);

    } catch (err) {
      this.logger.error('[media-proxy] Erro:', err);
      return res.status(502).json({ error: 'Falha ao obter mídia' });
    }
  }

  @Post('crm/mark-as-read')
  async markChatAsRead(@Request() req, @Body() body: { jid: string }) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.markChatAsRead(branchId, body.jid);
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

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
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

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
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

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
  @Put('templates/:id')
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateMessageTemplateDto) {
    try {
      return this.whatsappService.updateTemplate(id, dto);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    try {
      return this.whatsappService.deleteTemplate(id);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  // ─── Campaigns ─────────────────────────────────────────────────

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
  @Get('campaigns')
  async getCampaigns(@Request() req) {
    try {
      const branchId = req.user?.branchId;
      const partnerId = req.user?.partnerId;
      this.logger.log(`[getCampaigns] branchId: ${branchId}, partnerId: ${partnerId}`);
      return this.whatsappService.getCampaigns(branchId, partnerId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Public()
  @UseGuards(JwtPartnerAuthGuard)
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


}
