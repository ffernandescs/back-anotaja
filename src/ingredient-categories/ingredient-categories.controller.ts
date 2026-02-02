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
import { IngredientCategoriesService } from './ingredient-categories.service';
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

@Controller('ingredient-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IngredientCategoriesController {
  constructor(private readonly ingredientCategoriesService: IngredientCategoriesService) {}

  @Post()
  @Roles('admin', 'manager')
  create(@Body() createCategoryDto: any, @Req() req: RequestWithUser) {
    return this.ingredientCategoriesService.create(createCategoryDto, req.user.userId);
  }

  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.ingredientCategoriesService.findAll(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.ingredientCategoriesService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: any,
    @Req() req: RequestWithUser,
  ) {
    return this.ingredientCategoriesService.update(id, updateCategoryDto, req.user.userId);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.ingredientCategoriesService.remove(id, req.user.userId);
  }
}
