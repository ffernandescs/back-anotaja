import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { JwtService } from '@nestjs/jwt';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { GeocodingService } from '../geocoding/geocoding.service';

@Injectable()
export class CustomersService {
  constructor(
    private jwtService: JwtService,
    private readonly geocodingService: GeocodingService,
  ) {}

  async create(dto: CreateCustomerDto, subdomain?: string) {
    const { name, phone, email, addresses } = dto;

    // Busca a branch pelo subdomain
    const branch = await prisma.branch.findUnique({
      where: { subdomain },
    });
    if (!branch) throw new NotFoundException('Filial não encontrada');

    // Verifica se o telefone já existe na mesma filial
    const existing = await prisma.customer.findUnique({
      where: { phone_branchId: { phone, branchId: branch.id } },
    });
    if (existing) throw new ConflictException('Telefone já cadastrado');

    const customer = await prisma.customer.create({
      data: {
        name,
        phone,
        email,
        branchId: branch.id,
      },
      include: { addresses: true },
    });

    // Gera JWT incluindo branchId no payload (igual ao login)
    const token = this.jwtService.sign(
      {
        userId: customer.id,
        phone: customer.phone,
        branchId: customer.branchId,
      },
      { secret: process.env.JWT_CUSTOMER_SECRET, expiresIn: '7d' },
    );

    return { token, customer };
  }

  async createAddressCustomer(
    dto: CreateCustomerAddressDto,
    customerId: string,
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, branchId: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const cleanZipCode = dto.zipCode.replace(/-/g, '');
    let lat: number | null = null;
    let lng: number | null = null;

    const number = dto.number || '';

    try {
      const coordinates = await this.geocodingService.getCoordinates(
        dto.street,
        number,
        dto.city,
        cleanZipCode,
        dto.state,
      );

      if (coordinates) {
        lat = coordinates.lat;
        lng = coordinates.lng;
      }
    } catch (error) {
      // Log opcional
      console.warn('Erro ao buscar coordenadas:', error);
    }

    if (lat === null || lng === null) {
      throw new BadRequestException(
        'Não foi possível geocodificar o endereço. Verifique CEP e número.',
      );
    }

    return prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: {
            branchId: customer.branchId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.customerAddress.create({
        data: {
          ...dto,
          customerId: customer.id,
          branchId: customer.branchId,
          lat,
          lng,
        },
      });
    });
  }

  async deleteAddressCustomer(customerId: string, addressId: string) {
    const deletedAddress = await prisma.customerAddress.delete({
      where: { id: addressId, customerId },
    });

    if (!deletedAddress) {
      throw new NotFoundException('Endereço não encontrado');
    }

    return deletedAddress;
  }

  async updateAddressCustomer(
    addressId: string,
    dto: CreateCustomerAddressDto,
    customerId: string,
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, branchId: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const address = await prisma.customerAddress.findFirst({
      where: {
        id: addressId,
        customerId: customer.id,
      },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    return prisma.$transaction(async (tx) => {
      // Se estiver marcando este endereço como padrão
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: {
            branchId: customer.branchId,
            isDefault: true,
            NOT: { id: addressId },
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.customerAddress.update({
        where: { id: addressId },
        data: {
          ...dto,
        },
      });
    });
  }

  async findAll(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    return prisma.customer.findMany({
      where: { branchId: user.branchId },
      include: {
        addresses: {
          orderBy: { isDefault: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllCustomerAddresses(customerId: string) {
    return prisma.customerAddress.findMany({
      where: { customerId },
    });
  }

  async findOne(id: string, branchId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id, branchId },
      include: { addresses: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
    const user = await this.findOne(id, userId);

    return prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        branchId: user.branchId,
      },
      include: { addresses: true },
    });
  }

  async remove(id: string, branchId: string) {
    await this.findOne(id, branchId);

    return prisma.customer.delete({
      where: { id },
    });
  }

  async login(dto: LoginCustomerDto, subdomain: string | undefined) {
    // Verifica se a filial existe
    const branch = await prisma.branch.findUnique({
      where: { subdomain },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada');
    }

    // Busca o cliente pelo telefone E branchId para garantir associação correta
    const customer = await prisma.customer.findFirst({
      where: {
        phone: dto.phone,
        branchId: branch.id,
      },
    });

    // Se não existir, retorna erro
    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    // Gera JWT incluindo branchId no payload
    const token = this.jwtService.sign(
      {
        userId: customer.id,
        phone: customer.phone,
        branchId: customer.branchId,
      },
      { secret: process.env.JWT_CUSTOMER_SECRET, expiresIn: '7d' },
    );

    return { token, customer };
  }

  /**
   * Define um endereço como padrão
   */

  async getCustomerById(id: string) {
    return await prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        orders: true,
        addresses: true,
      },
    });
  }

  async setDefaultAddress(
    customerId: string,
    addressId: string,
    branchId: string,
  ) {
    await this.findOne(customerId, branchId);

    return prisma.$transaction([
      prisma.customerAddress.updateMany({
        where: { customerId },
        data: { isDefault: false },
      }),
      prisma.customerAddress.update({
        where: { id: addressId },
        data: { isDefault: true },
      }),
    ]);
  }
}
