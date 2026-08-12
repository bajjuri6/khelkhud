/** Standard API response envelope. */
export type ApiOk<T> = { data: T };
export type ApiErr = { error: { code: string; message: string } };

export type Paginated<T> = {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
};
