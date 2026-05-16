import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OpenAIResponse } from './types';

/** Fluxos na resposta reativa só por perguntas (IA): hoje apenas `businessHours`. `operatingStatus` automático vai por caminho próprio quando fechado. */
export type CrmReactiveIntentFlow = 'operatingStatus' | 'businessHours';

const CRM_BUSINESS_HOURS_CLASSIFIER_SYSTEM =
  'És só um classificador JSON para WhatsApp de restaurante ou loja (pt-BR).\n' +
  'Determina se a mensagem do cliente pergunta sobre HORÁRIOS de funcionamento (dias, que horas abre/fecha, expediente).\n' +
  'Devolve apenas businessHours se for claramente pergunta de horário/expediente.\n' +
  'Não incluas cumprimento genérico ("oi"), pedido de menu só, perguntas "aberto agora" sem lista de dias.\n' +
  'Resposta: exclusivamente JSON minificado no formato {"intents":[]} ou {"intents":["businessHours"]}. Sem markdown, sem texto extra.';

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
   * Perguntas sobre horários de funcionamento → enviar fluxo businessHours pelo CRM reativo (Gemini + heurística).
   * Estado “fechado” / mensagem única quando fora do expediente: ver `trySendCrmClosedOperatingAuto` no WhatsAppService.
   */
  async classifyCrmReactiveIntents(userMessage: string): Promise<CrmReactiveIntentFlow[]> {
    const t = userMessage.trim();
    if (!t) return [];

    const raw = await this.classifyBusinessHoursReactiveWithGemini(t.slice(0, 800));
    const parsed = this.parseCrmReactiveBusinessHoursJson(raw);
    if (parsed !== null) return parsed;

    return this.heuristicCrmBusinessHoursOnly(t);
  }

  /** Gemini primeiro; não usa Groq (evita chave inválida em produção para este uso). */
  private async classifyBusinessHoursReactiveWithGemini(userMessage: string): Promise<string> {
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
            parts: [{ text: CRM_BUSINESS_HOURS_CLASSIFIER_SYSTEM }],
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
        console.warn(`⚠️ Gemini CRM hours classifier [${model}] — status ${status}`);
        if (status !== 429) break;
      }
    }

    return '';
  }

  private parseCrmReactiveBusinessHoursJson(raw: string): CrmReactiveIntentFlow[] | null {
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

    const out: CrmReactiveIntentFlow[] = [];
    for (const item of intents) {
      if (item === 'businessHours') {
        out.push('businessHours');
        break;
      }
    }
    return out;
  }

  private heuristicCrmBusinessHoursOnly(userMessage: string): CrmReactiveIntentFlow[] {
    const l = userMessage
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

    if (/\bhorario\b|\bhorarios\b|\bhora de funcionamento\b|\bexpediente\b|\bque horas\b/.test(l)) {
      return ['businessHours'];
    }
    if (/\b(?:abre|abrem|fecha|fecham|feche)(?:m)?\s+(?:as|a)\b/.test(l)) {
      return ['businessHours'];
    }
    if (
      /\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)\b.*\b(?:abre|fecha|fecham|horario|horarios)\b/.test(l)
    ) {
      return ['businessHours'];
    }

    return [];
  }
}