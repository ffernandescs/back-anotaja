import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { BranchOnboardingService } from './branch-onboarding.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateBranchOnboardingStepDto } from './dto/branch-onboarding.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    companyId: string;
    branchId: string;
  };
}

@Controller('branches/onboarding')
@UseGuards(JwtAuthGuard)
export class BranchOnboardingController {
  constructor(private readonly branchOnboardingService: BranchOnboardingService) {}

  @Get('status')
  async getStatus(@Request() req: RequestWithUser) {
    return this.branchOnboardingService.getBranchOnboardingStatus(
      req.user.branchId,
      req.user.userId,
    );
  }

  @Get('status/:branchId')
  async getStatusByBranchId(
    @Request() req: RequestWithUser,
    @Param('branchId') branchId: string,
  ) {
    return this.branchOnboardingService.getBranchOnboardingStatus(
      branchId,
      req.user.userId,
    );
  }

  @Patch('step')
  async updateStep(
    @Request() req: RequestWithUser,
    @Body() dto: UpdateBranchOnboardingStepDto,
  ) {
    return this.branchOnboardingService.updateBranchOnboardingStep(
      req.user.branchId,
      req.user.userId,
      dto.step,
    );
  }

  @Patch('step/:branchId')
  async updateStepByBranchId(
    @Request() req: RequestWithUser,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchOnboardingStepDto,
  ) {
    return this.branchOnboardingService.updateBranchOnboardingStep(
      branchId,
      req.user.userId,
      dto.step,
    );
  }

  @Post('complete')
  async complete(@Request() req: RequestWithUser) {
    return this.branchOnboardingService.completeBranchOnboarding(
      req.user.branchId,
      req.user.userId,
    );
  }

  @Post('complete/:branchId')
  async completeByBranchId(
    @Request() req: RequestWithUser,
    @Param('branchId') branchId: string,
  ) {
    return this.branchOnboardingService.completeBranchOnboarding(
      branchId,
      req.user.userId,
    );
  }

  @Post('skip')
  async skip(@Request() req: RequestWithUser) {
    return this.branchOnboardingService.skipBranchOnboarding(
      req.user.branchId,
      req.user.userId,
    );
  }

  @Post('skip/:branchId')
  async skipByBranchId(
    @Request() req: RequestWithUser,
    @Param('branchId') branchId: string,
  ) {
    return this.branchOnboardingService.skipBranchOnboarding(
      branchId,
      req.user.userId,
    );
  }
}
