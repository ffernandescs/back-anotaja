import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateAddonDto } from './dto/create-addon.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class AddonsService {
  async create(createAddonDto: CreateAddonDto) {
    const { key, name, description, price } = createAddonDto;

    // Verificar se já existe addon com esta key
    const existingAddon = await prisma.addon.findUnique({
      where: { key },
    });

    if (existingAddon) {
      throw new ConflictException(`Addon com key '${key}' já existe`);
    }

    const addon = await prisma.addon.create({
      data: {
        key,
        name,
        description,
        price,
        active: true,
      },
    });

    return addon;
  }

  async findAll() {
    return prisma.addon.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            features: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const addon = await prisma.addon.findUnique({
      where: { id },
      include: {
        features: {
          include: {
            feature: true,
          },
        },
        _count: {
          select: {
            features: true,
          },
        },
      },
    });

    if (!addon) {
      throw new NotFoundException('Addon não encontrado');
    }

    return addon;
  }

  async findByKey(key: string) {
    const addon = await prisma.addon.findUnique({
      where: { key },
      include: {
        features: {
          include: {
            feature: true,
          },
        },
        _count: {
          select: {
            features: true,
          },
        },
      },
    });

    if (!addon) {
      throw new NotFoundException('Addon não encontrado');
    }

    return addon;
  }

  async update(id: string, updateAddonDto: UpdateAddonDto) {
    const addon = await this.findOne(id);

    // Se estiver atualizando a key, verificar duplicidade
    if (updateAddonDto.key && updateAddonDto.key !== addon.key) {
      const existingAddon = await prisma.addon.findUnique({
        where: { key: updateAddonDto.key },
      });

      if (existingAddon) {
        throw new ConflictException(`Addon com key '${updateAddonDto.key}' já existe`);
      }
    }

    return prisma.addon.update({
      where: { id },
      data: updateAddonDto,
    });
  }

  async remove(id: string) {
    const addon = await this.findOne(id);

    // Verificar se há assinaturas usando este addon
    const subscriptionAddonsCount = await prisma.subscriptionAddon.count({
      where: { addonId: id },
    });

    if (subscriptionAddonsCount > 0) {
      throw new ConflictException(
        `Não é possível deletar o addon. Ele está sendo usado em ${subscriptionAddonsCount} assinatura(s).`,
      );
    }

    // Soft delete - apenas desativar
    return prisma.addon.delete({
      where: { id },
    });
  }

  async findAllIncludingInactive() {
    return prisma.addon.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        features: {
          include: {
            feature: true,
          },
        },
        _count: {
          select: {
            features: true,
          },
        },
      },
    });
  }

  async toggleActive(id: string) {
    const addon = await this.findOne(id);

    return prisma.addon.update({
      where: { id },
      data: { active: !addon.active },
    });
  }

  // Métodos para gestão de features do addon
  async addFeature(addonId: string, featureId: string) {
    // Verificar se addon existe
    await this.findOne(addonId);

    // Verificar se feature existe
    const feature = await prisma.feature.findUnique({
      where: { id: featureId },
    });

    if (!feature) {
      throw new NotFoundException('Feature não encontrada');
    }

    // Verificar se a associação já existe
    const existingAssociation = await prisma.addonFeature.findUnique({
      where: {
        addonId_featureId: {
          addonId,
          featureId,
        },
      },
    });

    if (existingAssociation) {
      throw new ConflictException('Feature já está associada a este addon');
    }

    return prisma.addonFeature.create({
      data: {
        addonId,
        featureId,
      },
      include: {
        feature: true,
      },
    });
  }

  async removeFeature(addonId: string, featureId: string) {
    // Verificar se addon existe
    await this.findOne(addonId);

    // Verificar se a associação existe
    const existingAssociation = await prisma.addonFeature.findUnique({
      where: {
        addonId_featureId: {
          addonId,
          featureId,
        },
      },
    });

    if (!existingAssociation) {
      throw new NotFoundException('Feature não está associada a este addon');
    }

    return prisma.addonFeature.delete({
      where: {
        addonId_featureId: {
          addonId,
          featureId,
        },
      },
    });
  }
}
