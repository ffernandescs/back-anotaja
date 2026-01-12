import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  async create(dto: CreateCustomerDto, userId: string) {
    const { name, phone, email, addresses } = dto;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    const existing = await prisma.customer.findUnique({
      where: { phone_branchId: { phone, branchId: user.branchId } },
    });

    if (existing && existing.branchId !== user.branchId) {
      throw new ConflictException('Telefone já cadastrado');
    }

    const hasDefault = addresses?.some((address) => address.isDefault) ?? false;

    return prisma.customer.create({
      data: {
        name,
        phone,
        email,
        branchId: user.branchId,
        addresses: {
          create:
            addresses?.map((address, index) => ({
              ...address,
              branchId: user.branchId ?? '',
              isDefault: hasDefault
                ? (address.isDefault ?? false)
                : index === 0, // garante 1 default
            })) ?? [],
        },
      },
      include: {
        addresses: true,
      },
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

  /**
   * Define um endereço como padrão
   */
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
