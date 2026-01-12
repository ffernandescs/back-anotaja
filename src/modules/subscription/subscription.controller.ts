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
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post()
  @Roles('admin', 'manager')
  create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.subscriptionService.create(
      createSubscriptionDto,
      req.user.userId,
    );
  }

  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.subscriptionService.findAll(req.user.userId);
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.subscriptionService.findByCompany(companyId, req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.subscriptionService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.subscriptionService.update(
      id,
      updateSubscriptionDto,
      req.user.userId,
    );
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.subscriptionService.remove(id, req.user.userId);
  }
}
