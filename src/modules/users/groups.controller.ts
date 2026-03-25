import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CheckAbilities } from '../../ability/decorators/check-abilities.decorator';
import { Action, Subject } from '../../ability/types/ability.types';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}
@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  async create(@Body() createGroupDto: CreateGroupDto,  @Req() req: RequestWithUser,) {
    return this.groupsService.create(createGroupDto, req.user.userId);
  }

  @Get()
  async findAll( @Req() req: RequestWithUser,) {
    return this.groupsService.findAll(req.user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string,  @Req() req: RequestWithUser,) {
    return this.groupsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateGroupDto: UpdateGroupDto,  @Req() req: RequestWithUser,) {
    return this.groupsService.update(id, updateGroupDto, req.user.userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string,  @Req() req: RequestWithUser,) {
    return this.groupsService.remove(id, req.user.userId);
  }
}
