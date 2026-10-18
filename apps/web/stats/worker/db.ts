// Structural subset of the D1 binding, shared with the real local workerd tests.
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<{ results: T[] }[]>;
  exec(sql: string): Promise<unknown>;
}
