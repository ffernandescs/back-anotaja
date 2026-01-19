import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ComplementsService } from './complements.service';
import { CreateComplementOptionDto } from './dto/create-complement-option.dto';
import { UpdateComplementOptionDto } from './dto/update-complement-option.dto';
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

@Controller('complement-options')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplementOptionsController {
  constructor(private readonly complementsService: ComplementsService) {}

  @Post()
  @Roles('admin', 'manager')
  create(
    @Body() createOptionDto: CreateComplementOptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.createOption(
      createOptionDto,
      req.user.userId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.complementsService.findOneOption(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() updateOptionDto: UpdateComplementOptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.updateOptionById(
      id,
      updateOptionDto,
      req.user.userId,
    );
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.complementsService.removeOptionById(id, req.user.userId);
  }
}
