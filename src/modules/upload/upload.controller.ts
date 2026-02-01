import {
  Controller,
  Post,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('upload')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @Roles('admin', 'manager')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only image files are allowed');
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 5MB');
    }

    const uploadFolder = folder || 'images';
    const url = await this.uploadService.uploadFile(file, uploadFolder);

    return {
      url,
      message: 'File uploaded successfully',
    };
  }

  @Post('category-image')
  @Roles('admin', 'manager')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCategoryImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only image files are allowed');
    }

    const url = await this.uploadService.uploadFile(file, 'categories');

    return {
      url,
      message: 'Category image uploaded successfully',
    };
  }

  @Post('product-image')
  @Roles('admin', 'manager')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProductImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only image files are allowed');
    }

    const url = await this.uploadService.uploadFile(file, 'products');

    return {
      url,
      message: 'Product image uploaded successfully',
    };
  }

  @Post('person-image')
  @Roles('admin', 'manager')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPersonImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    const url = await this.uploadService.uploadFile(file, 'persons');

    return {
      url,
      message: 'Person image uploaded successfully',
    };
  }

  @Post('branding')
  @Roles('admin', 'manager')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBrandingImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: 'logo' | 'banner',
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    // Validar tamanho máximo (5MB para banner, 2MB para logo)
    const maxSize = type === 'banner' ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File size must be less than ${type === 'banner' ? '5MB' : '2MB'}`,
      );
    }

    const folder = type === 'logo' ? 'branding/logos' : 'branding/banners';
    const url = await this.uploadService.uploadFile(file, folder);

    return {
      url,
      type,
      message: `${type === 'logo' ? 'Logo' : 'Banner'} uploaded successfully`,
    };
  }

  @Delete('file')
  @Roles('admin', 'manager')
  async deleteFile(@Body('url') url: string) {
    if (!url) {
      throw new BadRequestException('File URL is required');
    }

    await this.uploadService.deleteFile(url);

    return {
      message: 'File deleted successfully',
    };
  }
}
