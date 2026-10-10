export async function readAllPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  cancelled: () => boolean = () => false,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; !cancelled(); from += pageSize) {
    const { data, error } = await read(from, from + pageSize - 1);
    if (error) throw error;
    if (cancelled()) return [];
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
