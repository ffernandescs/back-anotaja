import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { OnboardingStep } from '@prisma/client';

@Injectable()
export class BranchOnboardingService {
  async getBranchOnboardingStatus(
    branchId: string,
    userId: string,
  ): Promise<{ completed: boolean; currentStep: OnboardingStep }> {
    // Verificar se o usuário tem acesso à filial
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const branch = await prisma.branch.findFirst({
      where: { 
        id: branchId,
        companyId: user.companyId 
      },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada ou não pertence à sua empresa');
    }

    // Verificar se é o primeiro acesso (data de criação é recente)
    const now = new Date();
    const createdAt = new Date(branch.createdAt);
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    
    // Se foi criada há mais de 24 horas, considerar que não é primeiro acesso
    if (hoursSinceCreation > 24 && branch.onboardingCompleted) {
      return {
        completed: true,
        currentStep: OnboardingStep.COMPLETED,
      };
    }

    // Se onboarding já foi concluído
    if (branch.onboardingCompleted) {
      return {
        completed: true,
        currentStep: OnboardingStep.COMPLETED,
      };
    }

    return {
      completed: false,
      currentStep: branch.onboardingStep,
    };
  }

  async updateBranchOnboardingStep(
    branchId: string,
    userId: string,
    step: OnboardingStep,
  ): Promise<{ success: boolean; currentStep: OnboardingStep }> {
    // Verificar se o usuário tem acesso à filial
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const branch = await prisma.branch.findFirst({
      where: { 
        id: branchId,
        companyId: user.companyId 
      },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada ou não pertence à sua empresa');
    }

    if (branch.onboardingCompleted) {
      throw new BadRequestException('Onboarding da filial já foi concluído');
    }

    await prisma.branch.update({
      where: { id: branchId },
      data: { onboardingStep: step },
    });

    return {
      success: true,
      currentStep: step,
    };
  }

  async completeBranchOnboarding(
    branchId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Verificar se o usuário tem acesso à filial
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const branch = await prisma.branch.findFirst({
      where: { 
        id: branchId,
        companyId: user.companyId 
      },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada ou não pertence à sua empresa');
    }

    if (branch.onboardingCompleted) {
      throw new BadRequestException('Onboarding da filial já foi concluído');
    }

    await prisma.branch.update({
      where: { id: branchId },
      data: {
        onboardingCompleted: true,
        onboardingStep: OnboardingStep.COMPLETED,
      },
    });

    return {
      success: true,
      message: 'Onboarding da filial concluído com sucesso',
    };
  }

  async skipBranchOnboarding(
    branchId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Verificar se o usuário tem acesso à filial
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const branch = await prisma.branch.findFirst({
      where: { 
        id: branchId,
        companyId: user.companyId 
      },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada ou não pertence à sua empresa');
    }

    await prisma.branch.update({
      where: { id: branchId },
      data: {
        onboardingCompleted: true,
        onboardingStep: OnboardingStep.COMPLETED,
      },
    });

    return {
      success: true,
      message: 'Onboarding da filial pulado com sucesso',
    };
  }
}
