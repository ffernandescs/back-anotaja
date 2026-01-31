import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchSchedule } from 'generated/prisma';
import { prisma } from '../../../lib/prisma';
import { BranchScheduleItemDto } from './dto/create-branch-schedule.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { GeocodingService } from '../geocoding/geocoding.service';

@Injectable()
export class BranchesService {
  constructor(private readonly geocodingService: GeocodingService) {}

  async create(createBranchDto: CreateBranchDto, userId: string) {
    // Buscar usuário com sua empresa
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');

    // Verificar se subdomain já existe (se fornecido)
    if (createBranchDto.subdomain) {
      const existingBranch = await prisma.branch.findUnique({
        where: { subdomain: createBranchDto.subdomain },
      });
      if (existingBranch)
        throw new ConflictException('Subdomínio já está em uso');
    }

    // Extrair dados de endereço do DTO
    const {
      street,
      city,
      state,
      zipCode,
      complement,
      neighborhood,
      reference,
      latitude,
      longitude,
      ...branchData
    } = createBranchDto;

    // Buscar coordenadas do endereço se não foram fornecidas
    let lat = latitude;
    let lng = longitude;

    if (!lat || !lng) {
      const cleanZipCode = zipCode?.replace(/-/g, '') || '';
      try {
        const coordinates = await this.geocodingService.getCoordinates(
          street || '',
          createBranchDto.number || '',
          city || '',
          cleanZipCode,
          state,
        );

        if (coordinates) {
          lat = coordinates.lat;
          lng = coordinates.lng;
        }
      } catch (error) {
        console.warn('Erro ao buscar coordenadas da branch:', error);
      }
    }

    // Criar branch e endereço em transação
    const branch = await prisma.$transaction(async (prisma) => {
      if (!user.companyId)
        throw new ForbiddenException(
          'Usuário não está associado a uma empresa',
        );
      if (!street) throw new BadRequestException('Endereço é obrigatório');

      const createAddress = await prisma.companyAddress.create({
        data: {
          street: street,
          number: createBranchDto.number ?? '',
          complement,
          neighborhood,
          city,
          state,
          zipCode,
          isDefault: true,
          reference,
          lat,
          lng,
          companyId: user.companyId,
        },
      });
      // 1️⃣ Criar branch
      const createdBranch = await prisma.branch.create({
        data: {
          ...branchData,
          document: createBranchDto.document ?? '',
          phone: createBranchDto.phone,
          latitude: lat,
          longitude: lng,
          companyId: user.companyId,
          addressId: createAddress.id,
          paymentMethods: {
            connect: createBranchDto.paymentMethods?.map((pm) => ({
              id: pm.id,
            })),
          },
        },
      });

      // 2️⃣ Criar endereço da branch
      await prisma.branchAddress.create({
        data: {
          street: street,
          city,
          state,
          zipCode,
          number: createBranchDto.number ?? '',
          complement,
          neighborhood,
          reference,
          lat,
          lng,
          branchId: createdBranch.id,
          isDefault: true,
        },
      });

      // Retornar branch criada com endereço
      return prisma.branch.findUnique({
        where: { id: createdBranch.id },
        include: {
          address: true,
          company: { select: { id: true, name: true } },
        },
      });
    });

    return branch;
  }

  async createSchedule(userId: string, dto: BranchScheduleItemDto[]) {
    // Pegar branch do usuário
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, company: true },
    });

    if (!user || !user.branchId) {
      throw new NotFoundException('Usuário não está associado a uma filial');
    }

    const branchId = user.branchId;

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Filial não encontrada');

    // Criar ou atualizar horários
    const createdSchedules: BranchSchedule[] = [];

    for (const schedule of dto) {
      const existing = await prisma.branchSchedule.findFirst({
        where: {
          branchId,
          day: schedule.day,
          date: schedule.date ? new Date(schedule.date) : null,
        },
      });

      if (existing) {
        const updated = await prisma.branchSchedule.update({
          where: { id: existing.id },
          data: {
            open: schedule.open,
            close: schedule.close,
            closed: schedule.closed,
            date: schedule.date ? new Date(schedule.date) : null,
          },
        });
        createdSchedules.push(updated); // ✅ agora não dá mais erro
      } else {
        const created = await prisma.branchSchedule.create({
          data: {
            branchId,
            day: schedule.day,
            open: schedule.open,
            close: schedule.close,
            closed: schedule.closed,
            date: schedule.date ? new Date(schedule.date) : null,
          },
        });
        createdSchedules.push(created);
      }
    }

    if (!user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');

    await prisma.company.update({
      where: { id: user.companyId },
      data: {
        onboardingStep: 'DOMAIN',
      },
    });

    return createdSchedules;
  }

  async updateSubdomain(subdomain: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, company: true },
    });

    if (!user || !user.branchId) {
      throw new NotFoundException('Usuário não está associado a uma filial');
    }

    const branchId = user.branchId;

    // Pega a branch atual
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, subdomain: true },
    });

    if (!branch) throw new NotFoundException('Filial não encontrada');

    // ⚠️ Se o subdomain enviado é igual ao atual, retorna sem atualizar
    if (
      branch.subdomain?.trim().toLowerCase() === subdomain.trim().toLowerCase()
    ) {
      return branch; // não faz update
    }

    // Verificar se existe outra branch com o mesmo subdomain
    const existingBranch = await prisma.branch.findFirst({
      where: {
        subdomain,
      },
      select: { id: true },
    });

    if (existingBranch) {
      throw new ConflictException('Subdomínio já está em uso');
    }
    if (!user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');

    await prisma.company.update({
      where: { id: user.companyId },
      data: {
        onboardingStep: 'PAYMENT',
      },
    });
    // Atualizar subdomain
    return prisma.branch.update({
      where: { id: branchId },
      data: { subdomain },
      include: { company: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true, orders: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
      include: {
        address: true,
        paymentMethods: true,
        openingHours: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Filia não encontrada');
    }

    return branch;
  }

  async updateSchedule(userId: string, dto: BranchScheduleItemDto[]) {
    // Verificar se branch pertence ao usuário
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.branchId) {
      throw new ForbiddenException(
        'Você não tem permissão para atualizar os horários desta filial',
      );
    }

    // Apagar todos os horários existentes da branch
    await prisma.branchSchedule.deleteMany({
      where: { branchId: user.branchId },
    });

    // Criar novamente todos os horários do array
    const createdSchedules: BranchSchedule[] = [];

    for (const schedule of dto) {
      const created = await prisma.branchSchedule.create({
        data: {
          branchId: user.branchId,
          day: schedule.day,
          open: schedule.open,
          close: schedule.close,
          closed: schedule.closed,
          date: schedule.date ? new Date(schedule.date) : null, // opcional
        },
      });
      createdSchedules.push(created);
    }

    return createdSchedules;
  }

  async checkSubdomainAvailability(
    subdomain: string,
    excludeBranchId?: string,
  ) {
    if (!subdomain) {
      throw new BadRequestException('Subdomínio é obrigatório');
    }

    const existingBranch = await prisma.branch.findFirst({
      where: {
        subdomain,
        ...(excludeBranchId && {
          NOT: { id: excludeBranchId },
        }),
      },
      select: { id: true },
    });

    return {
      available: !existingBranch,
    };
  }

  async findAll(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    return prisma.branch.findMany({
      where: { companyId: user.companyId },
      orderBy: { branchName: 'asc' },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findCurrent(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true, branch: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    if (!user.branchId) {
      throw new NotFoundException('Usuário não está associado a uma filial');
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: user.branchId,
        companyId: user.companyId,
      },
      include: {
        address: true,
        paymentMethods: true,
        openingHours: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada');
    }

    return branch;
  }

  async updateCurrent(userId: string, updateBranchDto: UpdateBranchDto) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    if (!user.branchId) {
      throw new NotFoundException('Usuário não está associado a uma filial');
    }

    // Verificar se subdomain já existe (se fornecido e diferente do atual)
    if (updateBranchDto.subdomain) {
      const existingBranch = (await prisma.branch.findFirst({
        where: {
          subdomain: updateBranchDto.subdomain,
          NOT: { id: user.branchId },
        },
      })) as { id: string } | null;

      if (existingBranch) {
        throw new ConflictException('Subdomínio já está em uso');
      }
    }

    return prisma.branch.update({
      where: { id: user.branchId },
      data: {
        ...updateBranchDto,
        document: updateBranchDto.document ?? '',
        phone: updateBranchDto.phone,
        address: {
          update: {
            street: updateBranchDto.street ?? '',
            city: updateBranchDto.city ?? '',
            state: updateBranchDto.state ?? '',
            zipCode: updateBranchDto.zipCode ?? '',
          },
        },
        paymentMethods: {
          set: updateBranchDto.paymentMethods?.map((paymentMethod) => ({
            id: paymentMethod.id,
          })),
        },
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async update(id: string, updateBranchDto: UpdateBranchDto, userId: string) {
    // Verificar se a branch pertence à empresa do usuário
    const branch = await this.findOne(id, userId);

    // Verificar se subdomain já existe (se fornecido e diferente do atual)
    if (updateBranchDto.subdomain) {
      const existingBranch = (await prisma.branch.findFirst({
        where: {
          subdomain: updateBranchDto.subdomain,
          NOT: { id },
        },
      })) as { id: string } | null;

      if (existingBranch) {
        throw new ConflictException('Subdomínio já está em uso');
      }
    }

    // Se houver atualização de endereço com coordenadas, buscar coordenadas se não fornecidas
    let lat = updateBranchDto.latitude;
    let lng = updateBranchDto.longitude;

    if (
      (updateBranchDto.street ||
        updateBranchDto.city ||
        updateBranchDto.state) &&
      (!lat || !lng) &&
      branch.address
    ) {
      try {
        const street = updateBranchDto.street || branch.address.street || '';
        const city = updateBranchDto.city || branch.address.city || '';
        const state = updateBranchDto.state || branch.address.state || '';
        const number = updateBranchDto.number || branch.address.number || '';

        if (street && city && state) {
          const coordinates = await this.geocodingService.getCoordinates(
            street,
            number,
            city,
            state,
            'Brasil',
          );

          if (coordinates) {
            lat = coordinates.lat;
            lng = coordinates.lng;
          }
        }
      } catch (error) {
        console.warn('Erro ao buscar coordenadas da branch:', error);
      }
    }

    // Preparar dados de atualização
    const updateData: any = {
      ...updateBranchDto,
      phone: updateBranchDto.phone ?? undefined,
      latitude: lat ?? undefined,
      longitude: lng ?? undefined,
    };

    // Remover campos de endereço do updateData pois serão atualizados separadamente
    delete updateData.street;
    delete updateData.number;
    delete updateData.complement;
    delete updateData.neighborhood;
    delete updateData.city;
    delete updateData.state;
    delete updateData.zipCode;
    delete updateData.email;

    // Atualizar branch e endereço em uma transação
    return prisma.$transaction(async (tx) => {
      // Atualizar endereço se houver campos de endereço e branch tiver addressId
      if (
        branch.addressId &&
        (updateBranchDto.street ||
          updateBranchDto.number ||
          updateBranchDto.complement !== undefined ||
          updateBranchDto.neighborhood ||
          updateBranchDto.city ||
          updateBranchDto.state ||
          updateBranchDto.zipCode ||
          lat ||
          lng)
      ) {
        // Atualizar o endereço usando o addressId da branch
        await tx.branchAddress.update({
          where: { id: branch.addressId },
          data: {
            street: updateBranchDto.street || undefined,
            number: updateBranchDto.number || undefined,
            complement: updateBranchDto.complement || undefined,
            neighborhood: updateBranchDto.neighborhood || undefined,
            city: updateBranchDto.city || undefined,
            state: updateBranchDto.state || undefined,
            zipCode: updateBranchDto.zipCode || undefined,
            lat: lat ? Math.round(lat * 1000000) : undefined,
            lng: lng ? Math.round(lng * 1000000) : undefined,
          },
        });
      }

      // Atualizar branch
      return tx.branch.update({
        where: { id },
        data: {
          ...updateData,
          paymentMethods: updateBranchDto.paymentMethods
            ? {
                set: updateBranchDto.paymentMethods.map((paymentMethod) => ({
                  id: paymentMethod.id,
                })),
              }
            : undefined,
        },
        include: {
          address: true,
          paymentMethods: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    });
  }

  async remove(id: string, userId: string) {
    // Verificar se a branch pertence à empresa do usuário
    await this.findOne(id, userId);

    return prisma.branch.delete({
      where: { id },
    });
  }
}
