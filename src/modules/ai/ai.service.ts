import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OpenAIResponse } from './types';

@Injectable()
export class AiService {
  private readonly GROQ_API_URL =
    process.env.GROQ_API_URL ||
    'https://api.groq.com/openai/v1/chat/completions';
  private readonly GROQ_API_KEY = process.env.GROQ_API_KEY || '';

  async generateDescription(name: string): Promise<string> {
    try {
      // Tentar usar Groq primeiro (gratuito e rápido)
      let description = await this.generateWithGroq(name, 'produto');

      // Se falhar, usar fallback inteligente
      if (!description || description.trim().length === 0) {
        description = this.generateIntelligentDescription(name);
      }

      // Limpar e formatar a descrição
      description = description
        .replace(/^["']|["']$/g, '') // Remover aspas
        .replace(/\n+/g, ' ') // Remover quebras de linha
        .trim();

      // Limitar a 200 caracteres
      if (description.length > 200) {
        description = description.substring(0, 197) + '...';
      }

      return description;
    } catch {
      // Em caso de erro, retornar descrição inteligente
      return this.generateIntelligentDescription(name);
    }
  }

  async generateCategoryDescription(name: string): Promise<string> {
    try {
      // Tentar usar Groq primeiro (gratuito e rápido)
      let description = await this.generateWithGroq(name, 'categoria');

      // Se falhar, usar fallback inteligente
      if (!description || description.trim().length === 0) {
        description = this.generateIntelligentCategoryDescription(name);
      }

      // Limpar e formatar a descrição
      description = description
        .replace(/^["']|["']$/g, '') // Remover aspas
        .replace(/\n+/g, ' ') // Remover quebras de linha
        .trim();

      // Limitar a 200 caracteres
      if (description.length > 200) {
        description = description.substring(0, 197) + '...';
      }

      return description;
    } catch {
      // Em caso de erro, retornar descrição inteligente
      return this.generateIntelligentCategoryDescription(name);
    }
  }

  private async generateWithGroq(
    name: string,
    type: 'produto' | 'categoria' = 'produto',
  ): Promise<string> {
    if (!this.GROQ_API_KEY) {
      return '';
    }

    const systemMessage =
      type === 'categoria'
        ? 'Você é um especialista em marketing gastronômico. Crie descrições curtas e atrativas para categorias de produtos de delivery. Máximo 150 caracteres.'
        : 'Você é um especialista em marketing gastronômico. Crie descrições curtas, atrativas e apetitosas para produtos de delivery. Máximo 150 caracteres.';

    const userMessage =
      type === 'categoria'
        ? `Crie uma descrição atrativa para a categoria: ${name}`
        : `Crie uma descrição atrativa para o produto: ${name}`;

    try {
      const response = await axios.post<OpenAIResponse>(
        this.GROQ_API_URL,
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: systemMessage,
            },
            {
              role: 'user',
              content: userMessage,
            },
          ],
          max_tokens: 100,
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

      if (
        response.data &&
        response.data.choices &&
        response.data.choices[0] &&
        response.data.choices[0].message
      ) {
        return response.data.choices[0].message.content.trim();
      }

      return '';
    } catch (error: any) {
      console.error('Erro ao gerar descrição com Groq:', error);
      return '';
    }
  }

  private generateIntelligentDescription(name: string): string {
    // Análise inteligente do nome do produto para gerar descrição contextual
    const nameLower = name.toLowerCase();

    // Detectar tipo de produto
    let adjectives: string[] = [];
    let preparation: string[] = [];

    if (
      nameLower.includes('burger') ||
      nameLower.includes('hamburguer') ||
      nameLower.includes('hambúrguer')
    ) {
      adjectives = ['suculento', 'saboroso', 'irresistível', 'artesanal'];
      preparation = [
        'preparado com carnes selecionadas',
        'com pão macio',
        'com ingredientes frescos',
      ];
    } else if (nameLower.includes('batata') || nameLower.includes('fritas')) {
      adjectives = ['crocante', 'dourada', 'perfeita', 'deliciosa'];
      preparation = ['fritas na hora', 'temperadas', 'com textura perfeita'];
    } else if (
      nameLower.includes('bebida') ||
      nameLower.includes('refrigerante') ||
      nameLower.includes('suco')
    ) {
      adjectives = ['gelada', 'refrescante', 'saborosa', 'perfeita'];
      preparation = ['bem gelada', 'com sabor intenso', 'para acompanhar'];
    } else if (nameLower.includes('pizza')) {
      adjectives = ['saborosa', 'artesanal', 'tradicional', 'irresistível'];
      preparation = [
        'com massa artesanal',
        'com ingredientes selecionados',
        'assada no forno',
      ];
    } else if (nameLower.includes('salada')) {
      adjectives = ['fresca', 'nutritiva', 'saborosa', 'balanceada'];
      preparation = [
        'com ingredientes frescos',
        'bem temperada',
        'nutritiva e saborosa',
      ];
    } else {
      adjectives = ['delicioso', 'saboroso', 'irresistível', 'especial'];
      preparation = [
        'preparado com carinho',
        'com ingredientes selecionados',
        'feito com dedicação',
      ];
    }

    // Selecionar adjetivos e preparação baseado no hash do nome
    const adjIndex = name.length % adjectives.length;
    const prepIndex = (name.length * 2) % preparation.length;

    const adjective = adjectives[adjIndex];
    const prep = preparation[prepIndex];

    // Gerar descrição variada
    const templates = [
      `${name} - ${adjective.charAt(0).toUpperCase() + adjective.slice(1)} e ${prep}, perfeito para satisfazer seu paladar.`,
      `${name} - ${prep.charAt(0).toUpperCase() + prep.slice(1)}, garantindo um ${adjective} sabor inesquecível.`,
      `${name} - Uma escolha ${adjective}, ${prep} para proporcionar a melhor experiência gastronômica.`,
    ];

    const templateIndex = name.length % templates.length;
    return templates[templateIndex];
  }

  private generateIntelligentCategoryDescription(name: string): string {
    // Análise inteligente do nome da categoria para gerar descrição contextual
    const nameLower = name.toLowerCase();

    // Detectar tipo de categoria
    let adjectives: string[] = [];
    let description: string[] = [];

    if (
      nameLower.includes('burger') ||
      nameLower.includes('hamburguer') ||
      nameLower.includes('hambúrguer')
    ) {
      adjectives = ['suculentos', 'saborosos', 'irresistíveis', 'artesanais'];
      description = [
        'Hambúrgueres preparados com carnes selecionadas e ingredientes frescos',
        'Combinações irresistíveis de sabores para todos os gostos',
        'Receitas artesanais que fazem a diferença',
      ];
    } else if (nameLower.includes('batata') || nameLower.includes('fritas')) {
      adjectives = ['crocantes', 'douradas', 'perfeitas', 'deliciosas'];
      description = [
        'Acompanhamentos crocantes e temperados na medida certa',
        'A opção perfeita para completar seu pedido',
        'Feitas com a textura ideal para agradar seu paladar',
      ];
    } else if (
      nameLower.includes('bebida') ||
      nameLower.includes('refrigerante') ||
      nameLower.includes('suco') ||
      nameLower.includes('drink')
    ) {
      adjectives = ['geladas', 'refrescantes', 'saborosas', 'perfeitas'];
      description = [
        'Bebidas geladas para acompanhar seu pedido',
        'Opções refrescantes para matar sua sede',
        'Sabores intensos para completar sua refeição',
      ];
    } else if (nameLower.includes('pizza')) {
      adjectives = ['saborosas', 'artesanais', 'tradicionais', 'irresistíveis'];
      description = [
        'Pizzas com massa artesanal e ingredientes selecionados',
        'Sabores tradicionais e inovadores para todos os gostos',
        'Assadas no ponto perfeito para garantir o melhor sabor',
      ];
    } else if (nameLower.includes('salada')) {
      adjectives = ['frescas', 'nutritivas', 'saborosas', 'balanceadas'];
      description = [
        'Saladas com ingredientes frescos e bem temperadas',
        'Opções nutritivas e saborosas para uma alimentação equilibrada',
        'Combinações balanceadas de sabores e texturas',
      ];
    } else if (nameLower.includes('sobremesa') || nameLower.includes('doce')) {
      adjectives = ['deliciosas', 'doces', 'tentadoras', 'especiais'];
      description = [
        'Sobremesas irresistíveis para finalizar sua refeição',
        'Doces preparados com ingredientes selecionados',
        'Opções especiais para adoçar seu dia',
      ];
    } else {
      adjectives = ['deliciosos', 'saborosos', 'irresistíveis', 'especiais'];
      description = [
        'Produtos preparados com carinho e ingredientes selecionados',
        'Opções que garantem o melhor sabor e qualidade',
        'Escolhas perfeitas para uma experiência gastronômica completa',
      ];
    }

    // Selecionar adjetivos e descrição baseado no hash do nome
    const adjIndex = name.length % adjectives.length;
    const descIndex = (name.length * 2) % description.length;

    const adjective = adjectives[adjIndex];
    const desc = description[descIndex];

    // Gerar descrição variada
    const templates = [
      `${name} - ${desc.charAt(0).toUpperCase() + desc.slice(1)}.`,
      `${name}: uma seleção de ${adjective} produtos para você.`,
      `Explore nossa categoria ${name.toLowerCase()} e descubra ${adjective} opções.`,
    ];

    const templateIndex = name.length % templates.length;
    return templates[templateIndex];
  }

  // Método alternativo usando OpenAI (se tiver API key)
  async generateWithOpenAI(name: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return this.generateIntelligentDescription(name);
    }

    try {
      const response = await axios.post<OpenAIResponse>(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content:
                'Você é um especialista em marketing gastronômico. Crie descrições curtas e atrativas para produtos de delivery.',
            },
            {
              role: 'user',
              content: `Crie uma descrição atrativa (máximo 150 caracteres) para o produto: ${name}`,
            },
          ],
          max_tokens: 100,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 10000,
        },
      );

      if (
        response.data &&
        response.data.choices &&
        response.data.choices[0] &&
        response.data.choices[0].message
      ) {
        return response.data.choices[0].message.content.trim();
      }

      return this.generateIntelligentDescription(name);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Erro ao gerar descrição com OpenAI:', error.message);
      } else {
        console.error(
          'Erro desconhecido ao gerar descrição com OpenAI:',
          error,
        );
      }
      return this.generateIntelligentDescription(name);
    }
  }
}
