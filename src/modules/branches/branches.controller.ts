import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BranchScheduleItemDto } from './dto/create-branch-schedule.dto';
import { UpdateBranchScheduleDto } from './dto/update-branch-schedule.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  create(
    @Body() createBranchDto: CreateBranchDto,
    @Req() req: RequestWithUser,
  ) {
    return this.branchesService.create(createBranchDto, req.user.userId);
  }

  @Get('check-subdomain')
  async checkSubdomain(
    @Query('subdomain') subdomain: string,
    @Query('excludeBranchId') excludeBranchId?: string,
  ) {
    return this.branchesService.checkSubdomainAvailability(
      subdomain,
      excludeBranchId,
    );
  }

  @Post('schedule')
  async createSchedule(
    @Req() req: RequestWithUser,
    @Body() dto: BranchScheduleItemDto[],
  ) {
    const userId = req.user.userId; // supondo que você tenha auth middleware
    return this.branchesService.createSchedule(userId, dto);
  }

  @Patch('schedule/:id')
  async updateSchedule(
    @Req() req: RequestWithUser,
    @Body() dto: BranchScheduleItemDto[], // array do front
  ) {
    const userId = req.user.userId;

    // passar o array dentro do objeto esperado
    return this.branchesService.updateSchedule(userId, dto);
  }

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('current') current?: string,
    @Query('all') all?: string,
  ) {
    // Por padrão, retorna a branch atual do usuário
    // Se ?all=true, retorna todas as branches da empresa
    if (all === 'true') {
      return this.branchesService.findAll(req.user.userId);
    }
    return this.branchesService.findCurrent(req.user.userId);
  }
  @Patch('update-subdomain')
  updateSubdomain(
    @Body() body: { subdomain: string },
    @Req() req: RequestWithUser,
  ) {
    return this.branchesService.updateSubdomain(
      body.subdomain,
      req.user.userId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.branchesService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateBranchDto: UpdateBranchDto,
    @Req() req: RequestWithUser,
  ) {
    return this.branchesService.update(id, updateBranchDto, req.user.userId);
  }

  @Put()
  updateCurrent(
    @Body() updateBranchDto: UpdateBranchDto,
    @Req() req: RequestWithUser,
  ) {
    return this.branchesService.updateCurrent(req.user.userId, updateBranchDto);
  }

  @Put(':id')
  updatePut(
    @Param('id') id: string,
    @Body() updateBranchDto: UpdateBranchDto,
    @Req() req: RequestWithUser,
  ) {
    return this.branchesService.update(id, updateBranchDto, req.user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.branchesService.remove(id, req.user.userId);
  }
}
