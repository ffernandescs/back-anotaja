import { Injectable } from '@nestjs/common';
import { CreateGenerateDescriptionDto } from './dto/create-generate-description.dto';
import { UpdateGenerateDescriptionDto } from './dto/update-generate-description.dto';

@Injectable()
export class GenerateDescriptionService {
  create(createGenerateDescriptionDto: CreateGenerateDescriptionDto) {
    return 'This action adds a new generateDescription';
  }

  findAll() {
    return `This action returns all generateDescription`;
  }

  findOne(id: number) {
    return `This action returns a #${id} generateDescription`;
  }

  update(id: number, updateGenerateDescriptionDto: UpdateGenerateDescriptionDto) {
    return `This action updates a #${id} generateDescription`;
  }

  remove(id: number) {
    return `This action removes a #${id} generateDescription`;
  }
}
