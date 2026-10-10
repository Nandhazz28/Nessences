// Minimal in-memory stand-in for the Mongoose calls the media lifecycle uses. It is NOT MongoDB:
// it only proves our logic, not query behaviour against a real database.
const flat = (v, parts) => {
  if (v == null) return [undefined];
  if (!parts.length) return Array.isArray(v) ? v : [v];
  if (Array.isArray(v)) return v.flatMap((x) => flat(x, parts));
  return flat(v[parts[0]], parts.slice(1));
};
const cond = (vals, c) => {
  if (c && typeof c === 'object' && !(c instanceof Date) && !Array.isArray(c)) {
    return Object.entries(c).every(([op, arg]) => {
      if (op === '$in') return vals.some((v) => arg.includes(v));
      if (op === '$ne') return !vals.some((v) => v === arg);
      if (op === '$lt') return vals.some((v) => v != null && v < arg);
      throw new Error(`fakeDb: unsupported operator ${op}`);
    });
  }
  return vals.some((v) => (c === null ? v == null : v === c));
};
export const matches = (doc, filter) => Object.entries(filter).every(([k, c]) => cond(flat(doc, k.split('.')), c));

let seq = 0;
export function fakeModel(initial = []) {
  const docs = initial.map((d) => ({ _id: `id${++seq}`, ...d }));
  const q = (rows) => ({ limit(n) { return q(rows.slice(0, n)); }, lean: async () => rows.map((r) => structuredClone(r)), then: (a, b) => Promise.resolve(rows).then(a, b) });
  const apply = (d, u) => {
    for (const [k, v] of Object.entries(u.$set ?? {})) d[k] = v;
    for (const k of Object.keys(u.$unset ?? {})) delete d[k];
    for (const [k, v] of Object.entries(u.$inc ?? {})) d[k] = (d[k] ?? 0) + v;
  };
  return {
    docs,
    failNext: null, // set to an Error to make the next write throw
    async create(d) { if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } const r = { _id: `id${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...d }; docs.push(r); return r; },
    find: (f) => q(docs.filter((d) => matches(d, f))),
    findOne: (f) => ({ lean: async () => { const d = docs.find((x) => matches(x, f)); return d ? structuredClone(d) : null; } }),
    findById: (id) => ({ lean: async () => { const d = docs.find((x) => x._id === id); return d ? structuredClone(d) : null; } }),
    async exists(f) { const d = docs.find((x) => matches(x, f)); return d ? { _id: d._id } : null; },
    async updateOne(f, u) { if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } const d = docs.find((x) => matches(x, f)); if (d) apply(d, u); return { matchedCount: d ? 1 : 0 }; },
    async updateMany(f, u) { docs.filter((x) => matches(x, f)).forEach((d) => apply(d, u)); },
    async deleteOne(f) { const i = docs.findIndex((x) => matches(x, f)); if (i >= 0) docs.splice(i, 1); },
  };
}
