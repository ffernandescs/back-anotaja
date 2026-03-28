import { Test, TestingModule } from '@nestjs/testing';
import { CashSessionService } from './cash-session.service';
import { prisma } from '../../../lib/prisma';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CashSessionStatus, ShiftType } from './dto/create-cash-session.dto';
import { CashMovementType, CashSessionStatus as PrismaCashSessionStatus } from '@prisma/client';

describe('CashSessionService - SaaS PDV Rules', () => {
  let service: CashSessionService;
  // let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    cashSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    cashMovement: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashSessionService,
        {
          provide: 'PrismaService',
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<CashSessionService>(CashSessionService);
    // prisma = module.get<PrismaService>('PrismaService');
  });

  describe('openCashSession', () => {
    const mockUser = {
      id: 'user1',
      name: 'Test User',
      branchId: 'branch1',
      company: { id: 'company1' },
    };

    it('should open cash session successfully', async () => {
      const createDto = {
        openingAmount: 1000,
        shiftType: ShiftType.MORNING,
        notes: 'Test opening',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.cashSession.findFirst.mockResolvedValue(null); // No open session
      mockPrisma.cashSession.findFirst.mockResolvedValue(null); // No last closed
      mockPrisma.cashSession.create.mockResolvedValue({
        id: 'session1',
        ...createDto,
        status: PrismaCashSessionStatus.OPEN,
        branchId: 'branch1',
        openedBy: 'user1',
        openingAmount: 1000,
        movements: [],
        branch: { id: 'branch1', branchName: 'Test Branch' },
      });

      const result = await service.openCashSession(createDto, 'user1');

      expect(result).toBeDefined();
      expect(mockPrisma.cashSession.create).toHaveBeenCalledWith({
        data: {
          branchId: 'branch1',
          openedBy: 'user1',
          status: PrismaCashSessionStatus.OPEN,
          shiftType: ShiftType.MORNING,
          openingAmount: 1000,
          notes: 'Test opening',
        },
        include: expect.any(Object),
      });
    });

    it('should throw error if user already has open session', async () => {
      const createDto = { openingAmount: 1000 };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.cashSession.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.openCashSession(createDto, 'user1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should use last closed session balance as previous balance', async () => {
      const createDto = { openingAmount: 500 };
      const lastClosed = {
        id: 'lastClosed',
        closingAmount: 2000,
        closedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.cashSession.findFirst
        .mockResolvedValueOnce(null) // No open session
        .mockResolvedValueOnce(lastClosed); // Last closed session
      mockPrisma.cashSession.create.mockResolvedValue({
        id: 'session1',
        openingAmount: 2500, // 2000 + 500
        status: PrismaCashSessionStatus.OPEN,
      });

      await service.openCashSession(createDto, 'user1');

      expect(mockPrisma.cashSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            openingAmount: 2500, // Previous balance + opening amount
          }),
        }),
      );
    });
  });

  describe('addCashMovement', () => {
    const mockUser = {
      id: 'user1',
      branchId: 'branch1',
      company: { id: 'company1' },
    };

    const mockOpenSession = {
      id: 'session1',
      status: PrismaCashSessionStatus.OPEN,
      branchId: 'branch1',
      openedBy: 'user1',
    };

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.cashSession.findFirst.mockResolvedValue(mockOpenSession);
    });

    it('should add deposit movement', async () => {
      const movementDto = {
        type: CashMovementType.DEPOSIT,
        amount: 500,
        description: 'Test deposit',
      };

      mockPrisma.cashMovement.create.mockResolvedValue({ id: 'movement1' });
      jest.spyOn(service, 'calculateExpectedBalance').mockResolvedValue({
        cashSessionId: 'session1',
        openingAmount: 1000,
        expectedAmount: 1500,
        totalSales: 0,
        salesByCash: 0,
        salesByCredit: 0,
        salesByDebit: 0,
        salesByPix: 0,
        salesByOnline: 0,
        totalDeposits: 500,
        totalWithdrawals: 0,
        balance: {
          cash: 1500,
          credit: 0,
          debit: 0,
          pix: 0,
          online: 0,
          total: 1500,
        },
        openedAt: new Date(),
        openedBy: 'user1',
        openedByName: 'Test User',
        openingNotes: '',
        status: PrismaCashSessionStatus.OPEN,
        shiftType: 'CUSTOM',
        movements: [],
      });

      const result = await service.addCashMovement('user1', movementDto);

      expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith({
        data: {
          cashSessionId: 'session1',
          type: CashMovementType.DEPOSIT,
          amount: 500,
          userId: 'user1',
          paymentMethod: 'CASH',
          description: 'Test deposit',
        },
      });
    });

    it('should require description for withdrawal', async () => {
      const movementDto = {
        type: CashMovementType.WITHDRAWAL,
        amount: 200,
        // No description provided
      };

      await expect(service.addCashMovement('user1', movementDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle transfer between sessions', async () => {
      const transferDto = {
        type: CashMovementType.TRANSFER,
        amount: 300,
      };

      const targetSession = {
        id: 'targetSession',
        branchId: 'branch1',
      };

      mockPrisma.cashSession.findUnique.mockResolvedValue(targetSession);
      jest.spyOn(service, 'calculateExpectedBalance').mockResolvedValue({
        cashSessionId: 'session1',
        openingAmount: 1000,
        expectedAmount: 1000,
        totalSales: 0,
        salesByCash: 0,
        salesByCredit: 0,
        salesByDebit: 0,
        salesByPix: 0,
        salesByOnline: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        balance: {
          cash: 1000,
          credit: 0,
          debit: 0,
          pix: 0,
          online: 0,
          total: 1000,
        },
        openedAt: new Date(),
        openedBy: 'user1',
        openedByName: 'Test User',
        openingNotes: '',
        status: PrismaCashSessionStatus.OPEN,
        shiftType: 'CUSTOM',
        movements: [],
      });

      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.addCashMovement('user1', transferDto, 'targetSession');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: 'Transferência realizada com sucesso' });
    });

    it('should validate sufficient balance for withdrawal', async () => {
      const movementDto = {
        type: CashMovementType.WITHDRAWAL,
        amount: 2000,
        description: 'Test withdrawal',
      };

      jest.spyOn(service, 'calculateExpectedBalance').mockResolvedValue({
        cashSessionId: 'session1',
        openingAmount: 1000,
        expectedAmount: 1000,
        totalSales: 0,
        salesByCash: 0,
        salesByCredit: 0,
        salesByDebit: 0,
        salesByPix: 0,
        salesByOnline: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        balance: {
          cash: 1000,
          credit: 0,
          debit: 0,
          pix: 0,
          online: 0,
          total: 1000,
        },
        openedAt: new Date(),
        openedBy: 'user1',
        openedByName: 'Test User',
        openingNotes: '',
        status: PrismaCashSessionStatus.OPEN,
        shiftType: 'CUSTOM',
        movements: [],
      });

      await expect(service.addCashMovement('user1', movementDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('closeCashSession', () => {
    const mockUser = {
      id: 'user1',
      branchId: 'branch1',
      company: { id: 'company1' },
    };

    const mockOpenSession = {
      id: 'session1',
      status: PrismaCashSessionStatus.OPEN,
      branchId: 'branch1',
      openedBy: 'user1',
      openingAmount: 1000,
      movements: [
        {
          type: CashMovementType.SALE,
          amount: 500,
          paymentMethod: 'CASH',
        },
        {
          type: CashMovementType.DEPOSIT,
          amount: 200,
        },
        {
          type: CashMovementType.WITHDRAWAL,
          amount: 100,
        },
      ],
    };

    it('should close cash session with correct calculations', async () => {
      const closeDto = {
        closingAmount: 1700, // Real amount counted
        notes: 'Test closing',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.cashSession.findUnique.mockResolvedValue(mockOpenSession);
      
      // First update to CLOSING status
      mockPrisma.cashSession.update
        .mockResolvedValueOnce({ status: PrismaCashSessionStatus.CLOSING })
        // Final update to CLOSED status
        .mockResolvedValueOnce({
          id: 'session1',
          status: PrismaCashSessionStatus.CLOSED,
          closingAmount: 1700,
          expectedAmount: 1600, // 1000 + 500 + 200 - 100
          difference: 100, // 1700 - 1600
        });

      const result = await service.closeCashSession('session1', closeDto, 'user1');

      expect(mockPrisma.cashSession.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.cashSession.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: 'session1' },
          data: {
            status: PrismaCashSessionStatus.CLOSED,
            closedAt: expect.any(Date),
            closedBy: 'user1',
            closingAmount: 1700,
            expectedAmount: 1600,
            difference: 100,
            notes: 'Test closing',
          },
        }),
      );
    });
  });

  describe('findAllCashSessions', () => {
    it('should return only user sessions for regular operators', async () => {
      const mockUser = {
        id: 'user1',
        branchId: 'branch1',
        company: { id: 'company1' },
        group: {
          permissions: [], // No manage permission
        },
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.cashSession.findMany.mockResolvedValue([]);

      await service.findAllCashSessions('user1');

      expect(mockPrisma.cashSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            branchId: 'branch1',
            openedBy: 'user1', // Only user's sessions
          },
        }),
      );
    });

    it('should return all branch sessions for supervisors', async () => {
      const mockUser = {
        id: 'supervisor1',
        branchId: 'branch1',
        company: { id: 'company1' },
        group: {
          permissions: [
            { subject: 'cash_register', action: 'manage' }, // Has manage permission
          ],
        },
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.cashSession.findMany.mockResolvedValue([]);

      await service.findAllCashSessions('supervisor1');

      expect(mockPrisma.cashSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            branchId: 'branch1', // All sessions in branch
          },
        }),
      );
    });
  });

  describe('calculateExpectedBalance', () => {
    const mockUser = {
      id: 'user1',
      branchId: 'branch1',
      company: { id: 'company1' },
    };

    const mockOpenSession = {
      id: 'session1',
      status: PrismaCashSessionStatus.OPEN,
      branchId: 'branch1',
      openedBy: 'user1',
      openingAmount: 1000,
      movements: [
        {
          type: CashMovementType.SALE,
          amount: 500,
          paymentMethod: 'CASH',
        },
        {
          type: CashMovementType.SALE,
          amount: 300,
          paymentMethod: 'CREDIT_CARD',
        },
        {
          type: CashMovementType.DEPOSIT,
          amount: 200,
        },
        {
          type: CashMovementType.WITHDRAWAL,
          amount: 100,
        },
      ],
    };

    it('should calculate expected balance correctly', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.cashSession.findFirst.mockResolvedValue(mockOpenSession);

      const result = await service.calculateExpectedBalance('user1');

      expect(result.expectedAmount).toBe(1600); // 1000 + 500 + 200 - 100
      expect(result.salesByCash).toBe(500);
      expect(result.salesByCredit).toBe(300);
      expect(result.totalDeposits).toBe(200);
      expect(result.totalWithdrawals).toBe(100);
      expect(result.balance.cash).toBe(1600);
    });
  });
});
