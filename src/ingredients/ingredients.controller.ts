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
import { IngredientsService } from './ingredients.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('ingredients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Post()
  @Roles('admin', 'manager')
  create(@Body() createIngredientDto: any, @Req() req: RequestWithUser) {
    return this.ingredientsService.create(createIngredientDto, req.user.userId);
  }

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.ingredientsService.findAll(req.user.userId, categoryId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.ingredientsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() updateIngredientDto: any,
    @Req() req: RequestWithUser,
  ) {
    return this.ingredientsService.update(id, updateIngredientDto, req.user.userId);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.ingredientsService.remove(id, req.user.userId);
  }
}
