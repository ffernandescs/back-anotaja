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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateProductAdvancedOptionsDto } from './dto/update-product-advanced-options.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles('admin', 'manager')
  create(
    @Body() createProductDto: CreateProductDto,
    @Req() req: RequestWithUser,
  ) {
    return this.productsService.create(createProductDto, req.user.userId);
  }

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('categoryId') categoryId?: string,
    @Query('active') active?: string,
    @Query('featured') featured?: string,
  ) {
    return this.productsService.findAll(
      req.user.userId,
      categoryId,
      active,
      featured,
    );
  }

  @Get('featured')
  findFeatured(@Req() req: RequestWithUser) {
    return this.productsService.findFeatured(req.user.userId);
  }

  @Get('category/:categoryId')
  findByCategory(
    @Param('categoryId') categoryId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.productsService.findByCategory(categoryId, req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.productsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Req() req: RequestWithUser,
  ) {
    return this.productsService.update(id, updateProductDto, req.user.userId);
  }

  @Patch(':id/advanced-options')
  @Roles('admin', 'manager')
  async updateAdvancedOptions(
    @Param('id') productId: string,
    @Body() body: UpdateProductAdvancedOptionsDto,
    @Req() req: RequestWithUser,
  ) {
    return this.productsService.updateAdvancedOptions(
      productId,
      body,
      req.user.userId,
    );
  }

  @Put(':id')
  @Roles('admin', 'manager')
  updatePut(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Req() req: RequestWithUser,
  ) {
    return this.productsService.update(id, updateProductDto, req.user.userId);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.productsService.remove(id, req.user.userId);
  }
}
