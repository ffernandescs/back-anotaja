import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BillSplitsService } from './billsplits.service';
import { CreateBillSplitDto } from './dto/create-billsplit.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('bill-splits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillSplitsController {
  constructor(private readonly billSplitService: BillSplitsService) {}

  @Post()
  @Roles('admin', 'manager')
  create(@Body() dto: CreateBillSplitDto, @Req() req: RequestWithUser) {
    return this.billSplitService.create(dto, req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.billSplitService.findOne(id);
  }
}
