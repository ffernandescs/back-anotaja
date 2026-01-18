import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ChoosePlanDto } from './dto/choose-plan.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@Body() createPlanDto: CreatePlanDto, @Req() req: RequestWithUser) {
    return this.plansService.create(createPlanDto, req.user.userId);
  }

  @Get()
  @Public()
  findAll(@Req() req?: RequestWithUser) {
    const userId = req?.user?.userId;
    return this.plansService.findAll(userId);
  }

  @Get('active')
  @Public()
  findActive() {
    return this.plansService.findActive();
  }

  @Get('featured')
  @Public()
  findFeatured() {
    return this.plansService.findFeatured();
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(
    @Param('id') id: string,
    @Body() updatePlanDto: UpdatePlanDto,
    @Req() req: RequestWithUser,
  ) {
    return this.plansService.update(id, updatePlanDto, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.plansService.remove(id, req.user.userId);
  }

  @Post('choose')
  @Roles('admin', 'manager')
  choosePlan(@Req() req: RequestWithUser, @Body() dto: ChoosePlanDto) {
    return this.plansService.choosePlanForCompany(dto, req.user.userId);
  }
}
