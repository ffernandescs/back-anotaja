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
import { ComplementOptionsService } from './complement-options.service';
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
  constructor(
    private readonly complementOptionsService: ComplementOptionsService,
  ) {}

  @Post()
  @Roles('admin', 'manager')
  create(
    @Body() createComplementOptionDto: CreateComplementOptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementOptionsService.create(
      createComplementOptionDto,
      req.user.userId,
    );
  }

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('complementId') complementId?: string,
    @Query('active') active?: string,
  ) {
    return this.complementOptionsService.findAll(
      req.user.userId,
      complementId,
      active,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.complementOptionsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() updateComplementOptionDto: UpdateComplementOptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementOptionsService.update(
      id,
      updateComplementOptionDto,
      req.user.userId,
    );
  }

  @Put(':id')
  @Roles('admin', 'manager')
  updatePut(
    @Param('id') id: string,
    @Body() updateComplementOptionDto: UpdateComplementOptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementOptionsService.update(
      id,
      updateComplementOptionDto,
      req.user.userId,
    );
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.complementOptionsService.remove(id, req.user.userId);
  }
}
