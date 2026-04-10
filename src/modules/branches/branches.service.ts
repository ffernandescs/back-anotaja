import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchSchedule } from '@prisma/client';
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

    // Verificar se telefone já existe
    const existingPhoneBranch = await prisma.branch.findUnique({
      where: { phone: createBranchDto.phone },
    });
    if (existingPhoneBranch) {
      throw new ConflictException('Este número de telefone já está sendo usado por outra filial');
    }

    // Verificar se documento (CNPJ/CPF) já existe
    if (createBranchDto.document) {
      const existingDocumentBranch = await prisma.branch.findUnique({
        where: { document: createBranchDto.document },
      });
      if (existingDocumentBranch) {
        throw new ConflictException('Este documento (CNPJ/CPF) já está sendo usado por outra filial');
      }
    }

    // Verificar se email já existe
    if (createBranchDto.email) {
      const existingEmailBranch = await prisma.branch.findUnique({
        where: { email: createBranchDto.email },
      });
      if (existingEmailBranch) {
        throw new ConflictException('Este email já está sendo usado por outra filial');
      }
    }

    

    // Extrair dados de endereço do DTO
    const {
      street,
      complement,
      neighborhood,
      reference,
      latitude,
      number,
      longitude,
      document,
      city,
      state,
      zipCode,
      ...branchData
    } = createBranchDto;

      if (!branchData.branchName || !document || !branchData.email || !branchData.phone ) {
          throw new BadRequestException(
            'Todos os campos obrigatórios da empresa devem ser preenchidos.',
          );
        }
    
        if (!neighborhood || !city || !state || !zipCode || !number) {
          throw new BadRequestException(
            'Todos os campos obrigatórios do endereço devem ser preenchidos.',
          );
        }

    const cleanZipCode = zipCode.replace(/-/g, '');
    let lat: number | null = null;
    let lng: number | null = null;
    // Buscar coordenadas do endereço se não foram fornecidas

    
   try {
      // Tentar geocodificação com endereço completo primeiro
      const fullAddress = `${street || ''}, ${number || ''} ${neighborhood || ''}, ${city}, ${state}, ${cleanZipCode}, Brasil`;
      
      const geocodeResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          fullAddress,
        )}&limit=1`,
        {
          headers: {
            'User-Agent': 'AnotaJa/1.0',
          },
        },
      );

      if (geocodeResponse.ok) {
        const geocodeData = await geocodeResponse.json();
        if (
          geocodeData &&
          geocodeData.length > 0 &&
          geocodeData[0].lat &&
          geocodeData[0].lon
        ) {
          lat = parseFloat(geocodeData[0].lat);
          lng = parseFloat(geocodeData[0].lon);
        }
      }

      // Se não conseguiu com endereço completo, tentar apenas com CEP
      if (!lat || !lng) {
        const cepGeocode = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanZipCode}&country=Brasil&limit=1`,
          {
            headers: {
              'User-Agent': 'AnotaJa/1.0',
            },
          },
        );

        if (cepGeocode.ok) {
          const cepData = await cepGeocode.json();
          if (
            cepData &&
            cepData.length > 0 &&
            cepData[0].lat &&
            cepData[0].lon
          ) {
            lat = parseFloat(cepData[0].lat);
            lng = parseFloat(cepData[0].lon);
          }
        }
      }
    } catch (error) {
      console.warn('Erro ao buscar coordenadas da empresa:', error);
    }

    // Criar branch e endereço em transação
    const branch = await prisma.$transaction(async (prisma) => {
      if (!user.companyId)
        throw new ForbiddenException(
          'Usuário não está associado a uma empresa',
        );

      // 1️⃣ Criar branch
      const createdBranch = await prisma.branch.create({
        data: {
          ...branchData,
          document: createBranchDto.document ?? '',
          phone: createBranchDto.phone,
          latitude: lat,
          longitude: lng,
          companyId: user.companyId,
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
          street: createBranchDto.street || '',
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
    
    return prisma.branch.update({
      where: { id: branchId },
      data: {
        subdomain,
      },
    });
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
      return {
        available: false,
        message: 'Subdomínio é obrigatório',
      };
    }

    // Validação básica do subdomínio
    const subdomainRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (!subdomainRegex.test(subdomain.toLowerCase())) {
      return {
        available: false,
        message: 'Subdomínio inválido. Use apenas letras, números e hífens',
      };
    }

    const existingBranch = await prisma.branch.findFirst({
      where: {
        subdomain: subdomain.toLowerCase(),
        ...(excludeBranchId && {
          NOT: { id: excludeBranchId },
        }),
      },
      select: { id: true },
    });

    if (existingBranch) {
      return {
        available: false,
        message: 'Este subdomínio já está em uso',
      };
    }

    return {
      available: true,
      message: 'Subdomínio disponível',
      url: `https://${subdomain.toLowerCase()}.localhost:3000`,
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
      where: { 
        companyId: user.companyId,
        active: true 
      },
      orderBy: { branchName: 'asc' },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        address: true
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
        active: true,
      },
      include: {
        address: true,
        paymentMethods: true,
        openingHours: true,
        generalConfig: true,
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

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
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
      throw new NotFoundException('Filial não encontrada');
    }

    return branch;
  }

  async updateCurrent(userId: string, updateBranchDto: UpdateBranchDto) {
    // Buscar usuário com company
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    // Se usuário não tem branchId, buscar a primeira branch da empresa (similar ao auth.service)
    let branchId = user.branchId;
    if (!branchId) {
      const firstBranch = await prisma.branch.findFirst({
        where: { companyId: user.companyId },
      });
      
      if (!firstBranch) {
        throw new NotFoundException('Nenhuma filial encontrada para esta empresa');
      }
      
      branchId = firstBranch.id;
    }

    // Verificar se a branch existe
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada');
    }

    // Verificar se subdomain já existe (se fornecido e diferente do atual)
    if (updateBranchDto.subdomain) {
      const existingBranch = (await prisma.branch.findFirst({
        where: {
          subdomain: updateBranchDto.subdomain,
          NOT: { id: branchId },
        },
      })) as { id: string } | null;

      if (existingBranch) {
        throw new ConflictException('Subdomínio já está em uso');
      }
    }

    return prisma.$transaction(async (tx) => {
      let addressId: string | null = null;
      
      // Só processar endereço se campos relevantes foram explicitamente fornecidos
      const hasAddressData = updateBranchDto.street !== undefined || 
                            updateBranchDto.number !== undefined ||
                            updateBranchDto.city !== undefined ||
                            updateBranchDto.state !== undefined ||
                            updateBranchDto.zipCode !== undefined;
      
      if (hasAddressData) {
        if (updateBranchDto.street || updateBranchDto.number) {
          // Primeiro, remove a referência do addressId da Branch
          await tx.branch.update({
            where: { id: branchId },
            data: { addressId: null }
          });

          // Agora pode remover o endereço existente
          await tx.branchAddress.deleteMany({
            where: { branchId }
          });

          // Cria um novo endereço
          const newAddress = await tx.branchAddress.create({
            data: {
              street: updateBranchDto.street || '',
              number: updateBranchDto.number || '',
              complement: updateBranchDto.complement || '',
              neighborhood: updateBranchDto.neighborhood || '',
              city: updateBranchDto.city || '',
              state: updateBranchDto.state || '',
              zipCode: updateBranchDto.zipCode || '',
              branchId
            }
          });

          if(newAddress.id) {
            addressId = newAddress.id
          }
        } else {
          // Se campos de endereço foram fornecidos mas estão vazios, remove o endereço
          await tx.branch.update({
            where: { id: branchId },
            data: { addressId: null }
          });

          await tx.branchAddress.deleteMany({
            where: { branchId }
          });
        }
      }
      // Se não há dados de endereço fornecidos, não mexe no endereço existente
      
      // Atualiza os dados da filial (só se fornecidos)
      const finalUpdateData: any = {};
      
      if (updateBranchDto.branchName !== undefined) finalUpdateData.branchName = updateBranchDto.branchName;
      if (updateBranchDto.logoUrl !== undefined) finalUpdateData.logoUrl = updateBranchDto.logoUrl;
      if (updateBranchDto.bannerUrl !== undefined) finalUpdateData.bannerUrl = updateBranchDto.bannerUrl;
      if (updateBranchDto.phone !== undefined) finalUpdateData.phone = updateBranchDto.phone;
      if (updateBranchDto.primaryColor !== undefined) finalUpdateData.primaryColor = updateBranchDto.primaryColor;
      if (updateBranchDto.description !== undefined) finalUpdateData.description = updateBranchDto.description;
      if (updateBranchDto.instagram !== undefined) finalUpdateData.instagram = updateBranchDto.instagram;
      if (updateBranchDto.minOrderValue !== undefined) finalUpdateData.minOrderValue = updateBranchDto.minOrderValue;
      if (updateBranchDto.checkoutMessage !== undefined) finalUpdateData.checkoutMessage = updateBranchDto.checkoutMessage;
      if (updateBranchDto.latitude !== undefined) finalUpdateData.latitude = updateBranchDto.latitude;
      if (updateBranchDto.longitude !== undefined) finalUpdateData.longitude = updateBranchDto.longitude;
      if (hasAddressData) finalUpdateData.addressId = addressId; // Só atualiza addressId se houve alteração

      // Processar generalConfig se fornecido
      if (updateBranchDto.generalConfig) {
        await tx.generalConfig.upsert({
          where: { branchId },
          update: updateBranchDto.generalConfig,
          create: {
            branchId,
            ...updateBranchDto.generalConfig,
          },
        });
      }

      await tx.branch.update({
        where: { id: branchId },
        data: {
          ...finalUpdateData,
          paymentMethods: updateBranchDto.paymentMethods ? {
            set: updateBranchDto.paymentMethods.map((paymentMethod) => ({
              id: paymentMethod.id,
            })),
          } : undefined,
        },
      });

      // Depois, trata o endereço separadamente


      // Busca a branch atualizada com o novo endereço
      return tx.branch.findUnique({
        where: { id: branchId },
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          address: true
        },
      });
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
      // Atualizar branch
      await tx.branch.update({
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
      });

      // Tratar endereço separadamente (mesma lógica do updateCurrent)
      let addressId: string | null = null;
      
      // Só processar endereço se campos relevantes foram explicitamente fornecidos
      const hasAddressData = updateBranchDto.street !== undefined || 
                            updateBranchDto.number !== undefined ||
                            updateBranchDto.city !== undefined ||
                            updateBranchDto.state !== undefined ||
                            updateBranchDto.zipCode !== undefined;
      
      if (hasAddressData) {
        if (updateBranchDto.street || updateBranchDto.number) {
          // Primeiro, remove a referência do addressId da Branch
          await tx.branch.update({
            where: { id },
            data: { addressId: null }
          });

          // Agora pode remover o endereço existente
          await tx.branchAddress.deleteMany({
            where: { branchId: id }
          });

          // Cria um novo endereço
          const newAddress = await tx.branchAddress.create({
            data: {
              street: updateBranchDto.street || '',
              number: updateBranchDto.number || '',
              complement: updateBranchDto.complement || '',
              neighborhood: updateBranchDto.neighborhood || '',
              city: updateBranchDto.city || '',
              state: updateBranchDto.state || '',
              zipCode: updateBranchDto.zipCode || '',
              lat: lat ? Math.round(lat * 1000000) : undefined,
              lng: lng ? Math.round(lng * 1000000) : undefined,
              branchId: id,
            }
          });

          if(newAddress.id) {
            addressId = newAddress.id
          }
        } else {
          // Se campos de endereço foram fornecidos mas estão vazios, remove o endereço
          await tx.branch.update({
            where: { id },
            data: { addressId: null }
          });

          await tx.branchAddress.deleteMany({
            where: { branchId: id }
          });
        }
      }
      // Se não há dados de endereço fornecidos, não mexe no endereço existente

      // Atualiza a branch com o addressId (só se houve alteração de endereço)
      const finalUpdateData: any = {};
      
      if (updateBranchDto.branchName !== undefined) finalUpdateData.branchName = updateBranchDto.branchName;
      if (updateBranchDto.logoUrl !== undefined) finalUpdateData.logoUrl = updateBranchDto.logoUrl;
      if (updateBranchDto.bannerUrl !== undefined) finalUpdateData.bannerUrl = updateBranchDto.bannerUrl;
      if (updateBranchDto.phone !== undefined) finalUpdateData.phone = updateBranchDto.phone;
      if (updateBranchDto.primaryColor !== undefined) finalUpdateData.primaryColor = updateBranchDto.primaryColor;
      if (updateBranchDto.description !== undefined) finalUpdateData.description = updateBranchDto.description;
      if (updateBranchDto.instagram !== undefined) finalUpdateData.instagram = updateBranchDto.instagram;
      if (updateBranchDto.minOrderValue !== undefined) finalUpdateData.minOrderValue = updateBranchDto.minOrderValue;
      if (updateBranchDto.checkoutMessage !== undefined) finalUpdateData.checkoutMessage = updateBranchDto.checkoutMessage;
      if (updateBranchDto.latitude !== undefined) finalUpdateData.latitude = updateBranchDto.latitude;
      if (updateBranchDto.longitude !== undefined) finalUpdateData.longitude = updateBranchDto.longitude;
      if (hasAddressData) finalUpdateData.addressId = addressId; // Só atualiza addressId se houve alteração
      
      await tx.branch.update({
          where: { id },
          data: finalUpdateData
        });

      // Busca a branch atualizada com o novo endereço
      return tx.branch.findUnique({
        where: { id },
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

    // Fazer soft delete em vez de excluir fisicamente
    // para evitar problemas com foreign key constraints
    return prisma.branch.update({
      where: { id },
      data: {
        active: false,
      },
    });
  }

  async findNearbyBranches(cep: string, radiusInMeters: number = 3000) {
    const cleanCep = cep.replace(/\D/g, '');

    const userCoordinates = await this.geocodingService.getCoordinates(
      '',
      '',
      '',
      cleanCep,
      '',
    );

    if (!userCoordinates) {
      throw new NotFoundException(
        'Não foi possível obter as coordenadas do CEP informado',
      );
    }

    const branches = await prisma.branch.findMany({
      where: {
        active: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        address: true,
        openingHours: {
          orderBy: { day: 'asc' },
        },
      },
    });

    const branchesWithDistance = branches
      .map((branch) => {
        if (!branch.latitude || !branch.longitude) {
          return null;
        }

        const distance = this.calculateDistance(
          userCoordinates.lat,
          userCoordinates.lng,
          branch.latitude,
          branch.longitude,
        );

        if (distance <= radiusInMeters) {
          return {
            ...branch,
            distance,
          };
        }

        return null;
      })
      .filter((branch) => branch !== null)
      .sort((a, b) => a!.distance - b!.distance);

    return {
      userLocation: userCoordinates,
      branches: branchesWithDistance,
    };
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  async exportCatalog(sourceBranchId: string, userId: string) {
    if (!sourceBranchId) {
      throw new BadRequestException('ID da filial de origem é obrigatório');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    if (!user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    // Verificar se a filial de origem existe e pertence à mesma empresa
    const sourceBranch = await prisma.branch.findUnique({
      where: { id: sourceBranchId },
    });

    if (!sourceBranch) {
      throw new NotFoundException('Filial de origem não encontrada');
    }

    if (sourceBranch.companyId !== user.companyId) {
      throw new ForbiddenException('A filial de origem não pertence à sua empresa');
    }

    if (sourceBranch.id === user.branchId) {
      throw new ForbiddenException('Não é possível exportar da mesma filial');
    }

    // Buscar categorias e produtos da filial de origem
    const sourceCategories = await prisma.category.findMany({
      where: { 
        branchId: sourceBranchId,
        active: true 
      },
      orderBy: { createdAt: 'asc' },
    });

    const sourceProducts = await prisma.product.findMany({
      where: { 
        branchId: sourceBranchId,
        active: true 
      },
      include: {
        complements: {
          include: {
            options: true,
          },
        },
      },
      orderBy: [
        { displayOrder: 'asc' },
        { featured: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const result = await prisma.$transaction(async (prisma) => {
      let exportedCategories = 0;
      let exportedProducts = 0;
      const categoryMapping = new Map<string, string>(); // sourceId -> targetId

      // Exportar categorias
      for (const sourceCategory of sourceCategories) {
        // Verificar se já existe uma categoria com o mesmo nome na filial de destino
        const existingCategory = await prisma.category.findFirst({
          where: {
            branchId: user.branchId!,
            name: sourceCategory.name,
          },
        });

        if (!existingCategory) {
          const newCategory = await prisma.category.create({
            data: {
              name: sourceCategory.name,
              slug: sourceCategory.slug,
              description: sourceCategory.description || null,
              image: sourceCategory.image || null,
              active: sourceCategory.active,
              featured: sourceCategory.featured,
              branchId: user.branchId!,
            },
          });
          categoryMapping.set(sourceCategory.id, newCategory.id);
          exportedCategories++;
        } else {
          categoryMapping.set(sourceCategory.id, existingCategory.id);
        }
      }

      // Exportar produtos
      for (const sourceProduct of sourceProducts) {
        const targetCategoryId = categoryMapping.get(sourceProduct.categoryId);
        
        if (!targetCategoryId) {
          console.warn(`Categoria não encontrada para o produto ${sourceProduct.name}, pulando...`);
          continue;
        }

        // Verificar se já existe um produto com o mesmo nome na categoria de destino
        const existingProduct = await prisma.product.findFirst({
          where: {
            branchId: user.branchId!,
            categoryId: targetCategoryId,
            name: sourceProduct.name,
          },
        });

        if (!existingProduct) {
          const newProduct = await prisma.product.create({
            data: {
              name: sourceProduct.name,
              description: sourceProduct.description,
              price: sourceProduct.price,
              image: sourceProduct.image,
              active: sourceProduct.active,
              featured: sourceProduct.featured,
              hasPromotion: sourceProduct.hasPromotion,
              promotionalPrice: sourceProduct.promotionalPrice,
              promotionalType: sourceProduct.promotionalType,
              promotionalPeriodType: sourceProduct.promotionalPeriodType,
              promotionalStartDate: sourceProduct.promotionalStartDate,
              promotionalEndDate: sourceProduct.promotionalEndDate,
              promotionalDays: sourceProduct.promotionalDays,
              weight: sourceProduct.weight,
              preparationTime: sourceProduct.preparationTime,
              stockControlEnabled: sourceProduct.stockControlEnabled,
              minStock: sourceProduct.minStock,
              tags: sourceProduct.tags,
              filterMetadata: sourceProduct.filterMetadata,
              displayOrder: sourceProduct.displayOrder,
              installmentEnabled: sourceProduct.installmentEnabled,
              maxInstallments: sourceProduct.maxInstallments,
              minInstallmentValue: sourceProduct.minInstallmentValue,
              installmentInterestRate: sourceProduct.installmentInterestRate,
              installmentOnPromotionalPrice: sourceProduct.installmentOnPromotionalPrice,
              categoryId: targetCategoryId,
              branchId: user.branchId!,
              companyId: user.companyId!,
            },
          });

          // Exportar complementos se existirem
          if (sourceProduct.complements && sourceProduct.complements.length > 0) {
            for (const sourceComplement of sourceProduct.complements) {
              // Criar o complemento na filial de destino
              const newComplement = await prisma.productComplement.create({
                data: {
                  name: sourceComplement.name,
                  minOptions: sourceComplement.minOptions,
                  maxOptions: sourceComplement.maxOptions,
                  required: sourceComplement.required,
                  allowRepeat: sourceComplement.allowRepeat,
                  active: sourceComplement.active,
                  displayOrder: sourceComplement.displayOrder,
                  selectionType: sourceComplement.selectionType,
                  productId: newProduct.id,
                  branchId: user.branchId!,
                },
              });

              // Exportar opções do complemento
              if (sourceComplement.options && sourceComplement.options.length > 0) {
                for (const sourceOption of sourceComplement.options) {
                  await prisma.complementOption.create({
                    data: {
                      name: sourceOption.name,
                      price: sourceOption.price,
                      active: sourceOption.active,
                      stockControlEnabled: sourceOption.stockControlEnabled,
                      minStock: sourceOption.minStock,
                      displayOrder: sourceOption.displayOrder,
                      branchId: user.branchId!,
                    },
                  });
                }
              }
            }
          }

          exportedProducts++;
        }
      }

      return {
        exportedCategories,
        exportedProducts,
        totalCategories: sourceCategories.length,
        totalProducts: sourceProducts.length,
      };
    });

    return result;
  }

  async getGeneralConfig(branchId: string, userId: string) {
    // Verificar se o usuário tem acesso à branch
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.branchId !== branchId)
      throw new ForbiddenException('Você não tem acesso a esta filial');

    // Buscar ou criar GeneralConfig
    let generalConfig = await prisma.generalConfig.findUnique({
      where: { branchId },
    });

    if (!generalConfig) {
      // Criar com valores padrão se não existir
      generalConfig = await prisma.generalConfig.create({
        data: {
          branchId,
          enableServiceFee: false,
          serviceFeePercentage: 10,
        },
      });
    }

    return generalConfig;
  }

  /**
   * Busca branches por CEP com raio de 3km (endpoint público)
   */
  async findBranchesByZipCode(zipCode: string, radiusKm: number = 3) {
    // Converter CEP para coordenadas
    const coordinates = await this.geocodingService.getCoordinatesFromZipCode(zipCode);
    
    if (!coordinates) {
      throw new BadRequestException('CEP não encontrado ou inválido');
    }

    // Buscar todas as branches com coordenadas
    const branches = await prisma.branch.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        active: true,
        subdomain: { not: null }, // Apenas branches com subdomínio
      },
      include: {
        address: {
          select: {
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
            zipCode: true,
          },
        },
        openingHours: {
          select: {
            day: true,
            open: true,
            close: true,
          },
          orderBy: {
            day: 'asc',
          },
        },
      },
    });

    // Filtrar branches dentro do raio especificado
    const nearbyBranches = branches
      .filter((branch) => {
        if (!branch.latitude || !branch.longitude) return false;
        
        const distance = this.geocodingService.calculateDistance(
          coordinates.lat,
          coordinates.lng,
          branch.latitude,
          branch.longitude,
        );
        
        return distance <= radiusKm;
      })
      .map((branch) => {
        const distance = this.geocodingService.calculateDistance(
          coordinates.lat,
          coordinates.lng,
          branch.latitude!,
          branch.longitude!,
        );
        
        return {
          id: branch.id,
          branchName: branch.branchName,
          subdomain: branch.subdomain,
          phone: branch.phone,
          logoUrl: branch.logoUrl,
          description: branch.description,
          address: branch.address,
          openingHours: branch.openingHours || [],
          rating: 0, // Valor padrão (não existe no modelo)
          ratingsCount: 0, // Valor padrão (não existe no modelo)
          distance: Math.round(distance * 100) / 100, // Arredonda para 2 casas decimais
        };
      })
      .sort((a, b) => a.distance - b.distance); // Ordenar por distância

    return nearbyBranches;
  }

  async updateGeneralConfig(
    branchId: string,
    data: {
      enableServiceFee?: boolean;
      serviceFeePercentage?: number;
      enableDelivery?: boolean;
      enableDineIn?: boolean;
      enablePickup?: boolean;
      sendOrdersByWhatsApp?: boolean;
      showPromotionsScreen?: boolean;
      showMenuFooter?: boolean;
      verifyNewCustomerPhone?: boolean;
      hideOrderStatus?: boolean;
      hideStoreAddress?: boolean;
      simplifiedAddressInput?: boolean;
      referencePointRequired?: boolean;
      showCategoriesScreen?: boolean;
      hideFreightCalculation?: boolean;
      autoCompleteOrders?: boolean;
      tableCount?: number;
    },
    userId: string,
  ) {
    // Verificar se o usuário tem acesso à branch
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.branchId !== branchId)
      throw new ForbiddenException('Você não tem acesso a esta filial');

    // Validar porcentagem
    if (data.serviceFeePercentage !== undefined) {
      if (data.serviceFeePercentage < 0 || data.serviceFeePercentage > 100) {
        throw new BadRequestException('A porcentagem deve estar entre 0 e 100');
      }
    }

    // Atualizar ou criar GeneralConfig
    const generalConfig = await prisma.generalConfig.upsert({
      where: { branchId },
      update: data,
      create: {
        branchId,
        enableServiceFee: data.enableServiceFee ?? false,
        serviceFeePercentage: data.serviceFeePercentage ?? 10,
        enableDelivery: data.enableDelivery ?? true,
        enableDineIn: data.enableDineIn ?? true,
        enablePickup: data.enablePickup ?? true,
        sendOrdersByWhatsApp: data.sendOrdersByWhatsApp ?? false,
        showPromotionsScreen: data.showPromotionsScreen ?? false,
        showMenuFooter: data.showMenuFooter ?? true,
        verifyNewCustomerPhone: data.verifyNewCustomerPhone ?? false,
        hideOrderStatus: data.hideOrderStatus ?? false,
        hideStoreAddress: data.hideStoreAddress ?? false,
        simplifiedAddressInput: data.simplifiedAddressInput ?? false,
        referencePointRequired: data.referencePointRequired ?? false,
        showCategoriesScreen: data.showCategoriesScreen ?? true,
        hideFreightCalculation: data.hideFreightCalculation ?? false,
        autoCompleteOrders: data.autoCompleteOrders ?? false,
        tableCount: data.tableCount ?? 10,
      },
    });

    return generalConfig;
  }
}
