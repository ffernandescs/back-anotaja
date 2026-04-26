import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Request,
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  UpdateWhatsAppConfigDto,
  SendTestMessageDto,
  FetchMessagesDto,
  SendCrmMessageDto,
} from './dto/whatsapp.dto';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsAppController {
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

  @Post('connect')
  async connect(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.connect(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Delete('disconnect')
  async disconnect(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.disconnect(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Get('status')
  async getStatus(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.getStatus(branchId);
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
}
