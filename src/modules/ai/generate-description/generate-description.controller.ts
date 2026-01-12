import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { GenerateDescriptionService } from './generate-description.service';
import { CreateGenerateDescriptionDto } from './dto/create-generate-description.dto';
import { UpdateGenerateDescriptionDto } from './dto/update-generate-description.dto';

@Controller('generate-description')
export class GenerateDescriptionController {
  constructor(private readonly generateDescriptionService: GenerateDescriptionService) {}

  @Post()
  create(@Body() createGenerateDescriptionDto: CreateGenerateDescriptionDto) {
    return this.generateDescriptionService.create(createGenerateDescriptionDto);
  }

  @Get()
  findAll() {
    return this.generateDescriptionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.generateDescriptionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateGenerateDescriptionDto: UpdateGenerateDescriptionDto) {
    return this.generateDescriptionService.update(+id, updateGenerateDescriptionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.generateDescriptionService.remove(+id);
  }
}
