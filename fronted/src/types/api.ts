/** Shared pagination envelope shape used by list endpoints. */
export type Paginated<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};
