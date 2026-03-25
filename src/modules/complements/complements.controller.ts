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
import { ComplementsService } from './complements.service';
import { CreateComplementDto } from './dto/create-complement.dto';
import { UpdateComplementDto } from './dto/update-complement.dto';
import { CreateComplementOptionDto } from './dto/create-complement-option.dto';
import { UpdateComplementOptionDto } from './dto/update-complement-option.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AssociateComplementsDto } from './dto/associate-complements.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('complements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplementsController {
  constructor(private readonly complementsService: ComplementsService) {}

  @Post()
  
  create(
    @Body() createComplementDto: CreateComplementDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.create(createComplementDto, req.user.userId);
  }

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('productId') productId?: string,
    @Query('active') active?: string,
  ) {
    return this.complementsService.findAll(req.user.userId, productId, active);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.complementsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  
  update(
    @Param('id') id: string,
    @Body() updateComplementDto: UpdateComplementDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.update(
      id,
      updateComplementDto,
      req.user.userId,
    );
  }

  @Put(':id')
  
  updatePut(
    @Param('id') id: string,
    @Body() updateComplementDto: UpdateComplementDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.update(
      id,
      updateComplementDto,
      req.user.userId,
    );
  }

  @Delete(':id')
  
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.complementsService.remove(id, req.user.userId);
  }

  // Endpoints para gerenciar opções
  @Post(':complementId/options')
  
  addOption(
    @Param('complementId') complementId: string,
    @Body() createOptionDto: CreateComplementOptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.addOption(
      complementId,
      createOptionDto,
      req.user.userId,
    );
  }

  @Patch(':complementId/options/:optionId')
  
  updateOption(
    @Param('complementId') complementId: string,
    @Param('optionId') optionId: string,
    @Body() updateOptionDto: UpdateComplementOptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.updateOption(
      complementId,
      optionId,
      updateOptionDto,
      req.user.userId,
    );
  }

  @Post('associate-many/:productId')
  
  associateMany(
    @Param('productId') productId: string,
    @Body() associateDto: AssociateComplementsDto,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.associateComplementsToProduct(
      productId,
      associateDto,
      req.user.userId,
    );
  }

  @Patch(':productId/complements/:complementId/disassociate')
  async disassociateComplement(
    @Param('productId') productId: string,
    @Param('complementId') complementId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.disassociateComplementFromProduct(
      productId,
      complementId,
      req.user.userId,
    );
  }

  @Delete(':complementId/options/:optionId')
  
  removeOption(
    @Param('complementId') complementId: string,
    @Param('optionId') optionId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.complementsService.removeOption(
      complementId,
      optionId,
      req.user.userId,
    );
  }
}
