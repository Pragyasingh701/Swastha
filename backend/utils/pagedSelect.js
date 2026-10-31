// Supabase answers any read with at most 1000 rows (the project's max_rows setting) and says
// nothing when it cuts the list short. A query with no explicit limit therefore quietly loses
// everything past the 1000th row, which for an ordered list means the newest or the oldest rows
// just disappear. These helpers read a list in pages until it ends.
//
//   const { data, error } = await selectAll(() =>
//     supabase.from('intake_sessions').select('id, created_at').eq('patient_id', id)
//       .order('created_at').order('id'));
//
// The query MUST have a stable order (end it with a unique column such as id), or rows can repeat
// or go missing between pages. Pass a function that builds the query, not the query itself: a
// query can only be run once.

// Matches max_rows in supabase/config.toml. A page asked for with more than the server allows would
// come back short and be mistaken for the last page.
export const PAGE_SIZE = 1000;

// How many ids go into one `.in(...)` filter. Ids travel in the request URL, so a long list
// (every patient a doctor treats, every session they handled) overflows it.
export const IN_CHUNK_SIZE = 100;

// Safety ceiling, so a runaway table cannot be pulled into memory whole. Hitting it is logged.
const DEFAULT_MAX_ROWS = 50_000;

export async function selectAll(buildQuery, { maxRows = DEFAULT_MAX_ROWS, label = 'query' } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
  }
  console.warn(`[pagedSelect] ${label}: stopped at ${maxRows} rows, the list is longer than that.`);
  return { data: rows, error: null };
}

// Same, for a filter on a long list of ids: runs the query once per chunk of ids (each chunk read
// in full) and joins the results. The chunks are not ordered relative to each other, so a caller
// that needs one overall order sorts the result itself.
export async function selectAllIn(ids, buildQuery, { chunkSize = IN_CHUNK_SIZE, ...options } = {}) {
  const rows = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await selectAll(() => buildQuery(chunk), options);
    if (error) return { data: null, error };
    rows.push(...data);
  }
  return { data: rows, error: null };
}
