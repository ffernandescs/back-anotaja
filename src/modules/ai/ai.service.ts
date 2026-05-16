import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OpenAIResponse } from './types';

/** Intenções reconhecidas pela classificação reativa (Gemini + heurística) para disparar fluxos em `crmBootGreetingFlows`. */
export type CrmReactiveIntentFlow =
  | 'businessHours'
  | 'orderMenuLink'
  | 'productInfo'
  | 'establishmentAddress'
  | 'deliveryPaymentMethods'
  | 'productPromotions';

const CRM_REACTIVE_INTENTS_CLASSIFIER_SYSTEM =
  'És um classificador JSON para WhatsApp de restaurante ou loja (pt-BR).\n' +
  'Analisa a mensagem do cliente e devolve uma lista `intents` (pode ser vazia ou várias entradas).\n\n' +
  'Intenções possíveis:\n' +
  '- businessHours: pergunta sobre HORÁRIOS de funcionamento (dias, que horas abre/fecha, expediente).\n' +
  '- orderMenuLink: pedido explícito de LINK do cardápio/menu/site para pedir, "manda o link", "onde pedo", URL da loja.\n' +
  '- productInfo: pergunta sobre PRODUTO/ITEM do cardápio — preço, se tem/vende X, sabor, "quanto custa a pizza", disponibilidade de um prato.\n' +
  '- establishmentAddress: pergunta sobre ENDEREÇO/LOCAL da loja — "onde fica", "qual o endereço", "como chego", localização, ponto da loja.\n' +
  '- deliveryPaymentMethods: pergunta sobre FORMAS DE PAGAMENTO para pedir pelo delivery/cardápio online — PIX, cartão, dinheiro na entrega, "como posso pagar", "aceita cartão".\n' +
  '- productPromotions: pergunta sobre PROMOÇÕES/OFERTAS/DESCONTOS do cardápio — "quais promoções", "tem oferta", "o que está em promoção", produtos em desconto.\n\n' +
  'Não incluas cumprimento genérico ("oi") sem pedido.\n' +
  'Não uses orderMenuLink se o cliente citar um produto específico (use productInfo).\n' +
  'Não uses productInfo se for só pedido de link genérico sem citar produto.\n' +
  'Não uses businessHours se não for sobre horário/expediente.\n' +
  'Não uses establishmentAddress se for só pedido de link ou produto sem pedir local/endereço.\n' +
  'Não uses deliveryPaymentMethods se não for sobre pagamento/formas de pagar pedido online.\n' +
  'Não uses productPromotions para preço de UM produto específico (use productInfo); não uses productInfo para listar todas as promoções.\n\n' +
  'Resposta: JSON minificado só com chave intents (array de strings válidas acima). Sem markdown.';

const CRM_PRODUCT_SEARCH_EXTRACT_SYSTEM =
  'Extrai da mensagem do cliente (pt-BR) o termo de busca para achar produtos no cardápio.\n' +
  'Ex.: "vocês tem pizza calabresa?" → {"query":"pizza calabresa"}\n' +
  'Ex.: "quanto custa o x-bacon" → {"query":"x-bacon"}\n' +
  'Se não houver produto identificável, {"query":""}.\n' +
  'Resposta: exclusivamente JSON {"query":"..."} sem markdown.';

// ─── Tipos e configurações ────────────────────────────────────────────────────
type GenerationType = 'description' | 'category' | 'printer' | 'whatsapp' | 'free';

interface GeminiConfig {
  temperature: number;
  maxOutputTokens: number;
}

const GEMINI_CONFIGS: Record<GenerationType, GeminiConfig> = {
  description: { temperature: 0.8, maxOutputTokens: 300 },
  category:    { temperature: 0.7, maxOutputTokens: 150 },
  printer:     { temperature: 0.6, maxOutputTokens: 100 },
  whatsapp:    { temperature: 0.7, maxOutputTokens: 400 },
  free:        { temperature: 0.7, maxOutputTokens: 800 },
};

const SYSTEM_INSTRUCTION =
  'Você é um assistente especializado em delivery, restaurantes e iFood.\n' +
  'Sempre gere textos curtos, profissionais e que aumentem vendas.\n' +
  'Use emojis moderadamente.\n' +
  'Responda em português do Brasil.';

@Injectable()
export class AiService {
  private readonly GROQ_API_URL =
    process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
  private readonly GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  private readonly GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

  // ─── Método central Gemini ──────────────────────────────────────────────────
  private async generateWithGemini(
    prompt: string,
    type: GenerationType = 'free',
  ): Promise<string> {
    if (!this.GEMINI_API_KEY) {
      console.warn('⚠️ GEMINI_API_KEY não configurada');
      return '';
    }

    const config = GEMINI_CONFIGS[type];
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-8b'];
    

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.GEMINI_API_KEY}`;

        const body = {
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxOutputTokens,
          },
        };

        const response = await axios.post(url, body, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        });

        const text =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        if (text.trim()) return text.trim();
      } catch (error: any) {
        const status = error?.response?.status;
        console.warn(`⚠️ Gemini [${model}] falhou — status ${status}`);
        if (status !== 429) break;
      }
    }

    return '';
  }

  // ─── Groq genérico (fallback para prompt livre) ─────────────────────────────
  private async generateWithGroqFree(prompt: string): Promise<string> {
    if (!this.GROQ_API_KEY) {
      console.warn('⚠️ GROQ_API_KEY não configurada');
      return '';
    }

    try {
      const response = await axios.post<OpenAIResponse>(
        this.GROQ_API_URL,
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: prompt },
          ],
          max_tokens: 400,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.GROQ_API_KEY}`,
          },
          timeout: 15000,
        },
      );

      return response.data?.choices?.[0]?.message?.content?.trim() ?? '';
    } catch (error: any) {
      console.error('❌ Erro Groq (free):', error?.response?.data ?? error.message);
      return '';
    }
  }

  // ─── Groq específico por contexto ──────────────────────────────────────────
  private async generateWithGroq(
    prompt: string,
    maxTokens: number = 150,
  ): Promise<string> {
    if (!this.GROQ_API_KEY) return '';

    try {
      const response = await axios.post<OpenAIResponse>(
        this.GROQ_API_URL,
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.GROQ_API_KEY}`,
          },
          timeout: 10000,
        },
      );

      return response.data?.choices?.[0]?.message?.content?.trim() ?? '';
    } catch (error: any) {
      console.error('❌ Erro Groq:', error?.response?.data ?? error.message);
      return '';
    }
  }

  // ─── Públicos ───────────────────────────────────────────────────────────────

  async generateFree(prompt: string): Promise<string> {
    try {
      let result = await this.generateWithGemini(prompt, 'free');

      if (!result) {
        result = await this.generateWithGroqFree(prompt);
      }

      if (!result) {
        return 'Não foi possível gerar uma sugestão. Tente novamente.';
      }

      return result.replace(/^["']|["']$/g, '').trim();
    } catch {
      return 'Não foi possível gerar uma sugestão. Tente novamente.';
    }
  }

  async generateDescription(name: string): Promise<string> {
    const prompt = `Crie uma descrição atrativa para o produto: ${name}`;

    try {
      let result = await this.generateWithGemini(prompt, 'description');

      if (!result) {
        result = await this.generateWithGroq(prompt, 150);
      }

      if (!result) {
        result = this.generateIntelligentDescription(name);
      }

      return result
        .replace(/^["']|["']$/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .substring(0, 200);
    } catch {
      return this.generateIntelligentDescription(name);
    }
  }

  async generateCategoryDescription(name: string): Promise<string> {
    const prompt = `Crie uma descrição atrativa para a categoria: ${name}`;

    try {
      let result = await this.generateWithGemini(prompt, 'category');

      if (!result) {
        result = await this.generateWithGroq(prompt, 150);
      }

      if (!result) {
        result = this.generateIntelligentCategoryDescription(name);
      }

      return result
        .replace(/^["']|["']$/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .substring(0, 200);
    } catch {
      return this.generateIntelligentCategoryDescription(name);
    }
  }

  async generatePrinterMessage(type: 'delivery' | 'table'): Promise<string> {
    const prompt =
      type === 'delivery'
        ? 'Crie uma mensagem de agradecimento para cupom de delivery/retirada (máximo 100 caracteres)'
        : 'Crie uma mensagem de agradecimento para fechamento de mesa/comanda (máximo 100 caracteres)';

    try {
      let result = await this.generateWithGemini(prompt, 'printer');

      if (!result) {
        result = await this.generateWithGroq(prompt, 80);
      }

      if (!result) {
        result = this.generateIntelligentPrinterMessage(type);
      }

      return result
        .replace(/^["']|["']$/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .substring(0, 150);
    } catch {
      return this.generateIntelligentPrinterMessage(type);
    }
  }

  async generateQRCodeMessage(type: 'delivery' | 'table'): Promise<string> {
    try {
      return this.generateIntelligentQRCode(type);
    } catch {
      return this.generateIntelligentQRCode(type);
    }
  }

  async generateWhatsAppTemplate(
    type: 'confirmation' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled',
  ): Promise<string> {
    const typePrompts: Record<string, string> = {
      confirmation:
        'Crie uma mensagem de confirmação de pedido para WhatsApp. Use as variáveis: {orderNumber}, {customerName}, {total}, {items}, {branchName}.',
      ready:
        'Crie uma mensagem de pedido pronto para retirada no WhatsApp. Use as variáveis: {orderNumber}, {customerName}, {branchName}.',
      out_for_delivery:
        'Crie uma mensagem de pedido saiu para entrega no WhatsApp. Use as variáveis: {orderNumber}, {customerName}, {branchName}.',
      delivered:
        'Crie uma mensagem de pedido entregue com sucesso no WhatsApp. Use as variáveis: {orderNumber}, {customerName}, {branchName}.',
      cancelled:
        'Crie uma mensagem de pedido cancelado no WhatsApp. Use as variáveis: {orderNumber}, {customerName}, {branchName}.',
    };

    try {
      let result = await this.generateWithGemini(typePrompts[type], 'whatsapp');

      if (!result) {
        result = await this.generateWithGroq(typePrompts[type], 300);
      }

      if (!result) {
        result = this.generateIntelligentWhatsAppTemplate(type);
      }

      return result.replace(/^["']|["']$/g, '').trim();
    } catch {
      return this.generateIntelligentWhatsAppTemplate(type);
    }
  }

  // ─── Fallbacks inteligentes ─────────────────────────────────────────────────

  private generateIntelligentDescription(name: string): string {
    const nameLower = name.toLowerCase();
    let adjectives: string[];
    let preparation: string[];

    if (nameLower.includes('burger') || nameLower.includes('hamburguer') || nameLower.includes('hambúrguer')) {
      adjectives = ['suculento', 'saboroso', 'irresistível', 'artesanal'];
      preparation = ['preparado com carnes selecionadas', 'com pão macio', 'com ingredientes frescos'];
    } else if (nameLower.includes('batata') || nameLower.includes('fritas')) {
      adjectives = ['crocante', 'dourada', 'perfeita', 'deliciosa'];
      preparation = ['fritas na hora', 'temperadas', 'com textura perfeita'];
    } else if (nameLower.includes('bebida') || nameLower.includes('refrigerante') || nameLower.includes('suco')) {
      adjectives = ['gelada', 'refrescante', 'saborosa', 'perfeita'];
      preparation = ['bem gelada', 'com sabor intenso', 'para acompanhar'];
    } else if (nameLower.includes('pizza')) {
      adjectives = ['saborosa', 'artesanal', 'tradicional', 'irresistível'];
      preparation = ['com massa artesanal', 'com ingredientes selecionados', 'assada no forno'];
    } else if (nameLower.includes('salada')) {
      adjectives = ['fresca', 'nutritiva', 'saborosa', 'balanceada'];
      preparation = ['com ingredientes frescos', 'bem temperada', 'nutritiva e saborosa'];
    } else {
      adjectives = ['delicioso', 'saboroso', 'irresistível', 'especial'];
      preparation = ['preparado com carinho', 'com ingredientes selecionados', 'feito com dedicação'];
    }

    const adjective = adjectives[name.length % adjectives.length];
    const prep = preparation[(name.length * 2) % preparation.length];
    const templates = [
      `${name} - ${adjective.charAt(0).toUpperCase() + adjective.slice(1)} e ${prep}, perfeito para satisfazer seu paladar.`,
      `${name} - ${prep.charAt(0).toUpperCase() + prep.slice(1)}, garantindo um ${adjective} sabor inesquecível.`,
      `${name} - Uma escolha ${adjective}, ${prep} para proporcionar a melhor experiência gastronômica.`,
    ];

    return templates[name.length % templates.length];
  }

  private generateIntelligentCategoryDescription(name: string): string {
    const nameLower = name.toLowerCase();
    let adjectives: string[];
    let description: string[];

    if (nameLower.includes('burger') || nameLower.includes('hamburguer') || nameLower.includes('hambúrguer')) {
      adjectives = ['suculentos', 'saborosos', 'irresistíveis', 'artesanais'];
      description = ['Hambúrgueres preparados com carnes selecionadas e ingredientes frescos', 'Combinações irresistíveis de sabores para todos os gostos', 'Receitas artesanais que fazem a diferença'];
    } else if (nameLower.includes('batata') || nameLower.includes('fritas')) {
      adjectives = ['crocantes', 'douradas', 'perfeitas', 'deliciosas'];
      description = ['Acompanhamentos crocantes e temperados na medida certa', 'A opção perfeita para completar seu pedido', 'Feitas com a textura ideal para agradar seu paladar'];
    } else if (nameLower.includes('bebida') || nameLower.includes('refrigerante') || nameLower.includes('suco') || nameLower.includes('drink')) {
      adjectives = ['geladas', 'refrescantes', 'saborosas', 'perfeitas'];
      description = ['Bebidas geladas para acompanhar seu pedido', 'Opções refrescantes para matar sua sede', 'Sabores intensos para completar sua refeição'];
    } else if (nameLower.includes('pizza')) {
      adjectives = ['saborosas', 'artesanais', 'tradicionais', 'irresistíveis'];
      description = ['Pizzas com massa artesanal e ingredientes selecionados', 'Sabores tradicionais e inovadores para todos os gostos', 'Assadas no ponto perfeito para garantir o melhor sabor'];
    } else if (nameLower.includes('salada')) {
      adjectives = ['frescas', 'nutritivas', 'saborosas', 'balanceadas'];
      description = ['Saladas com ingredientes frescos e bem temperadas', 'Opções nutritivas e saborosas para uma alimentação equilibrada', 'Combinações balanceadas de sabores e texturas'];
    } else if (nameLower.includes('sobremesa') || nameLower.includes('doce')) {
      adjectives = ['deliciosas', 'doces', 'tentadoras', 'especiais'];
      description = ['Sobremesas irresistíveis para finalizar sua refeição', 'Doces preparados com ingredientes selecionados', 'Opções especiais para adoçar seu dia'];
    } else {
      adjectives = ['deliciosos', 'saborosos', 'irresistíveis', 'especiais'];
      description = ['Produtos preparados com carinho e ingredientes selecionados', 'Opções que garantem o melhor sabor e qualidade', 'Escolhas perfeitas para uma experiência gastronômica completa'];
    }

    const adjective = adjectives[name.length % adjectives.length];
    const desc = description[(name.length * 2) % description.length];
    const templates = [
      `${name} - ${desc.charAt(0).toUpperCase() + desc.slice(1)}.`,
      `${name}: uma seleção de ${adjective} produtos para você.`,
      `Explore nossa categoria ${name.toLowerCase()} e descubra ${adjective} opções.`,
    ];

    return templates[name.length % templates.length];
  }

  private generateIntelligentPrinterMessage(type: 'delivery' | 'table'): string {
    const deliveryMessages = [
      'Obrigado pela preferência! Volte sempre e aproveite nossas promoções.',
      'Agradecemos seu pedido! Esperamos vê-lo novamente em breve.',
      'Muito obrigado! Sua satisfação é nossa prioridade.',
      'Obrigado por escolher a gente! Até a próxima!',
      'Agradecemos a confiança! Volte sempre para mais sabor.',
    ];
    const tableMessages = [
      'Obrigado por sua visita! Esperamos vê-lo novamente em breve.',
      'Foi um prazer atendê-lo! Volte sempre!',
      'Agradecemos sua presença! Até a próxima visita.',
      'Obrigado pela preferência! Esperamos recebê-lo novamente.',
      'Foi ótimo ter você aqui! Volte sempre para mais momentos especiais.',
    ];

    const messages = type === 'delivery' ? deliveryMessages : tableMessages;
    return messages[Math.floor(Math.random() * messages.length)];
  }

  private generateIntelligentQRCode(type: 'delivery' | 'table'): string {
    return type === 'delivery'
      ? 'https://exemplo.com/avaliar-pedido'
      : 'https://exemplo.com/avaliar-atendimento';
  }

  private generateIntelligentWhatsAppTemplate(
    type: 'confirmation' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled',
  ): string {
    const templates: Record<string, string> = {
      confirmation: `📱 *Confirmação de Pedido*

Olá {customerName}!

Seu pedido #{orderNumber} foi *recebido* e está sendo preparado. 🍽️

🛒 *Itens:* {items}
💰 *Total:* R$ {total}

📍 {branchName}

Agradecemos pela preferência!`,

      ready: `✅ *Pedido Pronto!*

Olá {customerName}!

Seu pedido #{orderNumber} está *pronto* para retirada! 🎉

📍 {branchName}

Agradecemos pela preferência!`,

      out_for_delivery: `🚀 *Pedido a Caminho!*

Olá {customerName}!

Seu pedido #{orderNumber} *saiu para entrega* e já está chegando! 🛵

📍 {branchName}

Agradecemos pela preferência!`,

      delivered: `✅ *Pedido Entregue!*

Olá {customerName}!

Seu pedido #{orderNumber} foi *entregue* com sucesso. Bom apetite! 😋

📍 {branchName}

Agradecemos pela preferência!`,

      cancelled: `❌ *Pedido Cancelado*

Olá {customerName}!

Infelizmente seu pedido #{orderNumber} foi *cancelado*.

📍 {branchName}

Se tiver dúvidas, entre em contato conosco. Pedimos desculpas pelo inconveniente.`,
    };

    return templates[type] || '';
  }

  // ─── CRM WhatsApp: intenção para resposta automática (horário / status) ─────

  /**
   * Horários de funcionamento e/ou pedido de link do cardápio → fluxos reativos configurados em `crmBootGreetingFlows` (Gemini + heurística).
   * Estado “fechado” automático: `trySendCrmClosedOperatingAuto` no WhatsAppService.
   */
  async classifyCrmReactiveIntents(userMessage: string): Promise<CrmReactiveIntentFlow[]> {
    const t = userMessage.trim();
    if (!t) return [];

    const raw = await this.classifyCrmReactiveIntentsWithGemini(t.slice(0, 800));
    const parsed = this.parseCrmReactiveIntentsJson(raw);
    if (parsed !== null) return parsed;

    return this.heuristicCrmReactiveIntents(t);
  }

  /** Gemini primeiro; não usa Groq (evita chave inválida em produção para este uso). */
  private async classifyCrmReactiveIntentsWithGemini(userMessage: string): Promise<string> {
    if (!this.GEMINI_API_KEY) {
      return '';
    }

    const geminiTemps = {
      temperature: 0,
      maxOutputTokens: 120,
    };
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-8b'];

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.GEMINI_API_KEY}`;

        const body = {
          systemInstruction: {
            parts: [{ text: CRM_REACTIVE_INTENTS_CLASSIFIER_SYSTEM }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userMessage }],
            },
          ],
          generationConfig: {
            temperature: geminiTemps.temperature,
            maxOutputTokens: geminiTemps.maxOutputTokens,
          },
        };

        const response = await axios.post(url, body, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 14_000,
        });

        const text =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        if (text.trim()) return text.trim();
      } catch (error: any) {
        const status = error?.response?.status;
        console.warn(`⚠️ Gemini CRM reactive intents [${model}] — status ${status}`);
        if (status !== 429) break;
      }
    }

    return '';
  }

  private parseCrmReactiveIntentsJson(raw: string): CrmReactiveIntentFlow[] | null {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let data: unknown;
    try {
      data = JSON.parse(cleaned);
    } catch {
      return null;
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const intents = (data as Record<string, unknown>)['intents'];
    if (!Array.isArray(intents)) return null;

    const order: CrmReactiveIntentFlow[] = [
      'businessHours',
      'orderMenuLink',
      'productInfo',
      'establishmentAddress',
      'deliveryPaymentMethods',
      'productPromotions',
    ];
    const seen = new Set<CrmReactiveIntentFlow>();
    const out: CrmReactiveIntentFlow[] = [];

    for (const item of intents) {
      if (
        item === 'businessHours' ||
        item === 'orderMenuLink' ||
        item === 'productInfo' ||
        item === 'establishmentAddress' ||
        item === 'deliveryPaymentMethods' ||
        item === 'productPromotions'
      ) {
        const k = item as CrmReactiveIntentFlow;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
    }

    out.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (out.length === 0) return null;
    return out;
  }

  private heuristicCrmReactiveIntents(userMessage: string): CrmReactiveIntentFlow[] {
    const l = userMessage
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

    const hours =
      /\bhorario\b|\bhorarios\b|\bhora de funcionamento\b|\bexpediente\b|\bque horas\b/.test(l) ||
      /\b(?:abre|abrem|fecha|fecham|feche)(?:m)?\s+(?:as|a)\b/.test(l) ||
      /\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)\b.*\b(?:abre|fecha|fecham|horario|horarios)\b/.test(
        l,
      );

    const link =
      /\b(?:manda|envia|passa|mande|envie)(?:\s+o)?\s+(?:o\s+)?(?:link|site)\b/.test(l) ||
      /\b(?:qual|cad[eé]|onde)\s+(?:[eé]\s+)?(?:o\s+)?(?:link|site|cardapio|card[aá]pio)\b/.test(l) ||
      /\b(?:preciso|quero|precisamos)\s+(?:do\s+|o\s+)?(?:link|site|cardapio|card[aá]pio)\b/.test(l) ||
      /\b(?:link|site)\s+(?:do|da|para)\s+(?:pedido|cardapio|card[aá]pio|loja)\b/.test(l) ||
      /\b(?:card[aá]pio|cardapio)\s+(?:online|digital|pra|para)\s+pedir\b/.test(l) ||
      /\b(?:fazer|fazer\s+meu\s+)?pedido\s+online\b/.test(l) ||
      /\bonde\s+(?:eu\s+)?(?:posso|consigo)\s+(?:fazer\s+)?pedido\b/.test(l) ||
      /\burl\s+da\s+loja\b/.test(l);

    const promotions =
      /\b(?:promo[cç][aã]o|promo[cç][oõ]es)\b/.test(l) ||
      /\b(?:oferta|ofertas)\b/.test(l) ||
      /\b(?:desconto|descontos)\b/.test(l) ||
      /\b(?:o\s+)?que\s+est[aá]\s+em\s+promo/.test(l) ||
      /\b(?:tem|t[eê]m)\s+(?:alguma\s+)?promo/.test(l) ||
      /\bprodutos?\s+em\s+promo/.test(l) ||
      /\bquais\s+promo/.test(l);

    const product =
      !promotions &&
      (/\b(?:tem|t[eê]m|vende|vendem|trazem|servem)\b/.test(l) ||
        /\bquanto\s+(?:custa|custam|fica|é|e)\b/.test(l) ||
        /\b(?:pre[cç]o|valor)\s+(?:do|da|de)\b/.test(l) ||
        /\b(?:voc[eê]s|vcs)\s+tem\b/.test(l) ||
        /\b(?:tem|t[eê]m)\s+(?:algum|alguma)?\s*\w{3,}/.test(l) ||
        /\b(?:sabor|ingrediente|recheio|tamanho|por[cç][aã]o)\b/.test(l) ||
        /\b(?:pizza|hamb[uú]rguer|lanche|bebida|refrigerante|suco|por[cç][aã]o|combo)\b/.test(l));

    const address =
      /\b(?:endereco|endere[cç]o)\b/.test(l) ||
      /\b(?:onde\s+fica|onde\s+ficam|onde\s+est[aá]|fica\s+onde)\b/.test(l) ||
      /\b(?:como\s+chego|como\s+chegar|localiza[cç][aã]o)\b/.test(l) ||
      /\bqual\s+(?:o\s+)?(?:endereco|endere[cç]o)\b/.test(l) ||
      /\b(?:ponto|local)\s+(?:da\s+loja|do\s+estabelecimento)\b/.test(l);

    const out: CrmReactiveIntentFlow[] = [];
    if (hours) out.push('businessHours');
    if (link) out.push('orderMenuLink');
    if (product && !link) out.push('productInfo');
    else if (product && link && !/\b(?:manda|envia|passa)\s+(?:o\s+)?(?:link|site)\b/.test(l)) {
      out.push('productInfo');
    }
    if (address) out.push('establishmentAddress');

    const payment =
      /\b(?:forma|formas|metodo|metodos)\s+(?:de\s+)?pagamento\b/.test(l) ||
      /\b(?:como\s+)?(?:pago|pagamos|pagar|pagamento)\b/.test(l) ||
      /\b(?:aceita|aceitam)\s+(?:pix|cart[aã]o|dinheiro|credito|cr[eé]dito|debito|d[eé]bito)\b/.test(l) ||
      /\bpaga(?:r|mento)\s+(?:com|no|por|na entrega)\b/.test(l) ||
      /\b(?:pode|posso)\s+pagar\s+(?:com|no|por)\b/.test(l) ||
      /\bpix\b/.test(l) && /\b(?:delivery|pedido|entrega|online)\b/.test(l);

    if (payment) out.push('deliveryPaymentMethods');
    if (promotions) out.push('productPromotions');

    return out;
  }

  /**
   * Termo de busca para produtos no cardápio (Gemini + heurística local).
   */
  async extractCrmProductSearchQuery(userMessage: string): Promise<string> {
    const t = userMessage.trim();
    if (!t) return '';

    const raw = await this.extractCrmProductSearchQueryWithGemini(t.slice(0, 500));
    const parsed = this.parseCrmProductSearchQueryJson(raw);
    if (parsed !== null && parsed.length >= 2) return parsed;

    const heuristic = this.heuristicCrmProductSearchQuery(t);
    if (heuristic.length >= 2) return heuristic;

    return parsed ?? heuristic;
  }

  private async extractCrmProductSearchQueryWithGemini(userMessage: string): Promise<string> {
    if (!this.GEMINI_API_KEY) return '';

    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-8b'];

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.GEMINI_API_KEY}`;

        const body = {
          systemInstruction: {
            parts: [{ text: CRM_PRODUCT_SEARCH_EXTRACT_SYSTEM }],
          },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 80 },
        };

        const response = await axios.post(url, body, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 12_000,
        });

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text.trim()) return text.trim();
      } catch (error: any) {
        const status = error?.response?.status;
        console.warn(`⚠️ Gemini CRM product query [${model}] — status ${status}`);
        if (status !== 429) break;
      }
    }

    return '';
  }

  private parseCrmProductSearchQueryJson(raw: string): string | null {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    try {
      const data = JSON.parse(cleaned) as Record<string, unknown>;
      if (!data || typeof data !== 'object') return null;
      const q = data['query'];
      return typeof q === 'string' ? q.trim() : null;
    } catch {
      return null;
    }
  }

  private heuristicCrmProductSearchQuery(userMessage: string): string {
    let s = userMessage
      .replace(/[?!.]+$/g, '')
      .replace(
        /^(?:oi|ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite)[,!.\s]*/i,
        '',
      )
      .replace(
        /^(?:voc[eê]s|vcs)\s+(?:tem|t[eê]m|vendem|vende)\s+/i,
        '',
      )
      .replace(/^(?:tem|t[eê]m|vende|vendem)\s+/i, '')
      .replace(/^quanto\s+(?:custa|custam|fica|é|e)\s+(?:o|a|os|as)?\s*/i, '')
      .replace(/^(?:pre[cç]o|valor)\s+(?:do|da|de)\s+/i, '')
      .replace(/\s*(?:por favor|pfv|pf)\s*$/i, '')
      .trim();

    return s.slice(0, 120);
  }
}