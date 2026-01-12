export class PaginationMetaDto {
  /** Total de registros */
  total!: number;

  /** Página atual */
  page!: number;

  /** Itens por página */
  limit!: number;

  /** Total de páginas */
  totalPages!: number;

  /** Tem próxima página */
  hasNext!: boolean;

  /** Tem página anterior */
  hasPrevious!: boolean;
}

export class PaginatedResponseDto<T> {
  /** Dados paginados */
  data: T[];

  /** Metadados da paginação */
  meta: PaginationMetaDto;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    const totalPages = Math.ceil(total / limit);
    this.meta = {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }
}
