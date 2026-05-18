import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    branchId?: string;
  };
}

@Controller('announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  findAll(
    @Query('branchId') branchId: string,
    @Req() req: RequestWithUser,
  ) {
    const resolvedBranchId = branchId || req.user?.branchId;
    if (!resolvedBranchId) {
      return { announcements: [] };
    }
    return this.announcementsService.findAll(resolvedBranchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.announcementsService.findOne(id, req.user?.branchId);
  }

  @Post()
  create(@Body() dto: CreateAnnouncementDto, @Req() req: RequestWithUser) {
    const branchId = dto.branchId || req.user?.branchId;
    if (!branchId) {
      return { announcements: [] };
    }
    return this.announcementsService.create(
      { ...dto, branchId },
      req.user?.branchId,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @Req() req: RequestWithUser,
  ) {
    return this.announcementsService.update(id, dto, req.user?.branchId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.announcementsService.remove(id, req.user?.branchId);
  }
}
