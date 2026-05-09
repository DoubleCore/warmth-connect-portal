import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
};

export type Paginated<T> = {
  items: T[];
  pagination: PaginationMeta;
};

export function buildPagination(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total };
}

export function offset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
