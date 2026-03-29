// 🖨️ Seed de Impressoras - Dados de exemplo para o sistema

import { prisma } from '../lib/prisma';
import { PrinterSector, PrinterStatus } from '@prisma/client';

async function seedPrinters() {
  console.log('🖨️ Iniciando seed de impressoras...');

  // Buscar uma filial existente ou criar uma de exemplo
  let branch = await prisma.branch.findFirst();
  
  if (!branch) {
    console.log('📂 Criando filial de exemplo...');
    branch = await prisma.branch.create({
      data: {
        branchName: 'Filial Exemplo - Anotaja',
        phone: '11999999999',
        document: '00000000000100',
        email: 'exemplo@anotaja.com',
        subdomain: 'exemplo',
        active: true,
        primaryColor: '#3B82F6',
        companyId: 'temp-company-id', // Isso será substituído pelo seed-master
        minOrderValue: 1500,
        checkoutMessage: 'Agradecemos sua preferência!',
        latitude: -23.5505,
        longitude: -46.6333,
      },
    });
  }

  console.log(`📂 Usando filial: ${branch.branchName}`);

  // Dados de exemplo de impressoras
  const printersData = [
    {
      name: 'Impressora Principal',
      printerName: 'Impressora_Termica_1',
      sector: PrinterSector.GENERAL,
      isActive: true,
      status: PrinterStatus.ONLINE,
      copies: 1,
      printComplements: true,
      customMessage: 'Obrigado pela preferência! Volte sempre!',
      qrCodeUrl: 'https://anotaja.com/avaliacao',
      branchId: branch.id,
    },
    {
      name: 'Impressora Cozinha',
      printerName: 'Impressora_Cozinha',
      sector: PrinterSector.KITCHEN,
      isActive: true,
      status: PrinterStatus.ONLINE,
      copies: 2,
      printComplements: true,
      customMessage: 'Preparar com atenção aos detalhes!',
      branchId: branch.id,
    },
    {
      name: 'Impressora Bar',
      printerName: 'Impressora_Bar',
      sector: PrinterSector.BAR,
      isActive: true,
      status: PrinterStatus.ONLINE,
      copies: 1,
      printComplements: false,
      customMessage: 'Bebidas preparadas com cuidado!',
      branchId: branch.id,
    },
    {
      name: 'Impressora Delivery',
      printerName: 'Impressora_Delivery',
      sector: PrinterSector.DELIVERY,
      isActive: false, // Desativada para exemplo
      status: PrinterStatus.OFFLINE,
      copies: 1,
      printComplements: true,
      customMessage: 'Pedido para delivery - verificar endereço!',
      qrCodeUrl: 'https://anotaja.com/track',
      branchId: branch.id,
    },
  ];

  // Criar/atualizar impressoras
  for (const printerData of printersData) {
    const existingPrinter = await prisma.printer.findFirst({
      where: {
        name: printerData.name,
        branchId: printerData.branchId,
      },
    });

    if (existingPrinter) {
      await prisma.printer.update({
        where: { id: existingPrinter.id },
        data: printerData,
      });
      console.log(`✅ Impressora atualizada: ${printerData.name}`);
    } else {
      await prisma.printer.create({
        data: printerData,
      });
      console.log(`🖨️ Impressora criada: ${printerData.name}`);
    }
  }

  // Criar alguns trabalhos de impressão de exemplo
  const printers = await prisma.printer.findMany({
    where: { branchId: branch.id },
  });

  const printJobsData = [
    {
      printerId: printers[0]?.id,
      orderId: 'ORDER-001',
      orderType: 'DINE_IN',
      sector: PrinterSector.GENERAL,
      copies: 1,
      status: 'COMPLETED',
      printedAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutos atrás
    },
    {
      printerId: printers[1]?.id,
      orderId: 'ORDER-002',
      orderType: 'DINE_IN',
      sector: PrinterSector.KITCHEN,
      copies: 2,
      status: 'COMPLETED',
      printedAt: new Date(Date.now() - 1000 * 60 * 15), // 15 minutos atrás
    },
    {
      printerId: printers[0]?.id,
      orderId: 'ORDER-003',
      orderType: 'DELIVERY',
      sector: PrinterSector.GENERAL,
      copies: 1,
      status: 'PENDING',
    },
    {
      printerId: printers[2]?.id,
      orderId: 'ORDER-004',
      orderType: 'DINE_IN',
      sector: PrinterSector.BAR,
      copies: 1,
      status: 'ERROR',
      errorMessage: 'Impressora sem papel',
    },
  ];

  for (const jobData of printJobsData) {
    if (!jobData.printerId) continue;

    const existingJob = await prisma.printJob.findFirst({
      where: {
        orderId: jobData.orderId,
        printerId: jobData.printerId,
      },
    });

    if (!existingJob) {
      await prisma.printJob.create({
        data: jobData,
      });
      console.log(`📄 Trabalho de impressão criado: ${jobData.orderId}`);
    }
  }

  // Estatísticas finais
  const totalPrinters = await prisma.printer.count({
    where: { branchId: branch.id },
  });
  
  const activePrinters = await prisma.printer.count({
    where: { 
      branchId: branch.id,
      isActive: true,
    },
  });

  const onlinePrinters = await prisma.printer.count({
    where: { 
      branchId: branch.id,
      status: PrinterStatus.ONLINE,
    },
  });

  const totalJobs = await prisma.printJob.count({
    where: {
      printer: { branchId: branch.id },
    },
  });

  console.log('\n📊 Estatísticas das Impressoras:');
  console.log(`   🖨️  Total de impressoras: ${totalPrinters}`);
  console.log(`   ✅ Impressoras ativas: ${activePrinters}`);
  console.log(`   🌐 Impressoras online: ${onlinePrinters}`);
  console.log(`   📄 Total de trabalhos: ${totalJobs}`);
  console.log('\n🎉 Seed de impressoras concluído com sucesso!');
}

// Executar o seed
seedPrinters()
  .catch((error) => {
    console.error('❌ Erro no seed de impressoras:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
