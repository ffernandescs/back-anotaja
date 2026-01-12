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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
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

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles('admin', 'manager')
  create(@Body() createCategoryDto: CreateCategoryDto, @Req() req: RequestWithUser) {
    return this.categoriesService.create(createCategoryDto, req.user.userId);
  }

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('active') active?: string,
  ) {
    return this.categoriesService.findAll(req.user.userId, active);
  }

  @Get('featured')
  findFeatured(@Req() req: RequestWithUser) {
    return this.categoriesService.findFeatured(req.user.userId);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string, @Req() req: RequestWithUser) {
    return this.categoriesService.findBySlug(slug, req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.categoriesService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @Req() req: RequestWithUser,
  ) {
    return this.categoriesService.update(id, updateCategoryDto, req.user.userId);
  }

  @Put(':id')
  @Roles('admin', 'manager')
  updatePut(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @Req() req: RequestWithUser,
  ) {
    return this.categoriesService.update(id, updateCategoryDto, req.user.userId);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.categoriesService.remove(id, req.user.userId);
  }
}
