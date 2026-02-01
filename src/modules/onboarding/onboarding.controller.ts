import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Patch,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateOnboardingStepDto } from './dto/update-onboarding-step.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  async getStatus(@Request() req: RequestWithUser) {
    return this.onboardingService.getOnboardingStatus(req.user.userId);
  }

  @Patch('step')
  async updateStep(
    @Request() req: RequestWithUser,
    @Body() dto: UpdateOnboardingStepDto,
  ) {
    return this.onboardingService.updateOnboardingStep(req.user.userId, dto);
  }

  @Post('complete')
  async complete(@Request() req: RequestWithUser) {
    return this.onboardingService.completeOnboarding(req.user.userId);
  }

  @Post('skip')
  async skip(@Request() req: RequestWithUser) {
    return this.onboardingService.skipOnboarding(req.user.userId);
  }
}
