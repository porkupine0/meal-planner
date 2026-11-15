// Fake Firebase SDK v2 (shared state across the three module URLs the app imports)
const W = window;
const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const DEL = { __del: 1 };
const norm = x => JSON.stringify(x, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(q => [q, v[q]])) : v);

const isObj = v => v && typeof v === 'object' && !Array.isArray(v) && !v.__del && !v.__union && !v.__remove;
function mergeInto(t, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && v.__del) delete t[k];
    else if (v && v.__union) { const a = Array.isArray(t[k]) ? t[k] : (t[k] = []); for (const x of v.__union) if (!a.some(y => norm(y) === norm(x))) a.push(clone(x)); }
    else if (v && v.__remove) { if (Array.isArray(t[k])) t[k] = t[k].filter(y => !v.__remove.some(x => norm(x) === norm(y))); }
    else if (isObj(v)) { if (!isObj(t[k])) t[k] = {}; mergeInto(t[k], v); }
    else t[k] = clone(v);
  }
}
function build() {
const FS = { srv: {}, ver: {}, pending: [], listeners: [], online: true, sending: 0, log: [], stage: {}, user: { email: 'test@example.com', emailVerified: true }, seq: 0 };
const init = W.__FBINIT || {};
try { FS.user = localStorage.getItem('__authOut') === '1' ? null : (init.user === null ? null : FS.user); } catch {}
FS.stage = Object.assign({}, init.stage || {}); FS.gotServer = false;
const mergeSrv = ch => { FS.gotServer = true; for (const [p, [v, d]] of Object.entries(ch)) { if (v < (FS.ver[p] || 0)) continue; FS.ver[p] = v; if (d === null) delete FS.srv[p]; else FS.srv[p] = d; } };
FS.mergeSrv = mergeSrv;
if (init.offline) FS.online = false;
FS.ready = (async () => { if (init.cache) { FS.srv = clone(init.cache); FS.gotServer = false; } else if (!init.offline) mergeSrv((await W.__relayInit()).changes); })();
function applyUpdate(d, p, ops) { if (!(p in d)) return; for (const [fp, v] of ops) { let o = d[p]; for (let j = 0; j < fp.length - 1; j++) o = (o[fp[j]] ||= {}); const lk = fp[fp.length - 1]; if (v && v.__del) delete o[lk]; else if (v && v.__union) { const a = Array.isArray(o[lk]) ? o[lk] : (o[lk] = []); for (const x of v.__union) if (!a.some(y => norm(y) === norm(x))) a.push(clone(x)); } else if (v && v.__remove) { if (Array.isArray(o[lk])) o[lk] = o[lk].filter(y => !v.__remove.some(x => norm(x) === norm(y))); } else o[lk] = clone(v); } }
function applyOp(d, op) {
  if (op.t === 'set') { if (op.merge) { const t = d[op.p] || (d[op.p] = {}); mergeInto(t, op.d); } else d[op.p] = clone(op.d); } else if (op.t === 'delete') delete d[op.p];
  else if (op.t === 'update') applyUpdate(d, op.p, op.ops); else if (op.t === 'batch') for (const [p, x] of op.sets) d[p] = clone(x);
}
const view = () => { const d = clone(FS.srv); for (const op of FS.pending) applyOp(d, op); return d; };
const fire = () => { for (const l of FS.listeners) l(); }; FS.fire = fire;
function pump() {
  // writes are pipelined like the real SDK's write stream: all queued writes go out at once and the server applies them in order
  if (!FS.online) return;
  for (const op of FS.pending) {
    if (op.sent) continue; op.sent = true; FS.sending++;
    W.__relaySend({ t: op.t, p: op.p, d: op.d, ops: op.ops, sets: op.sets, merge: op.merge }).then(r => {
      FS.pending = FS.pending.filter(o => o !== op);
      mergeSrv(r.changes || {});
      FS.sending--; fire();
      if (r.ok) op.res(); else { const e = new Error(r.code); e.code = r.code; op.rej(e); }
      if (!FS.pending.length && FS.onDrain) { const f = FS.onDrain; FS.onDrain = null; f(); }
    });
  }
}
FS.onServer = changes => { if (!FS.online) return; mergeSrv(changes); fire(); };
FS.setOnline = async on => {
  if (!on) { FS.online = false; return; }
  FS.online = true; pump();
  const resync = async () => { mergeSrv((await W.__relayInit()).changes); fire(); };
  if (FS.pending.length) FS.onDrain = resync; else await resync();
};
FS.release = c => { delete FS.stage[c]; fire(); };
FS.signIn = () => { try { localStorage.removeItem('__authOut'); } catch {} FS.user = { email: 'test@example.com', emailVerified: true }; FS.authCb(FS.user); };
FS.view = view; const write = op => new Promise((res, rej) => { op.res = res; op.rej = rej; FS.log.push([op.t, op.p || '', op.ops ? op.ops.length : 0]); FS.pending.push(op); fire(); pump(); });

FS.write = write; FS.snapDoc = null;
return FS;
}
const FS = W.__FS || (W.__FS = build());
await FS.ready;
const view = FS.view, write = FS.write;
export const initializeApp = c => ({});
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const getAuth = () => ({});
export const getRedirectResult = async () => null;
export const onAuthStateChanged = (a, cb) => { FS.authCb = cb; setTimeout(() => cb(FS.user), 0); };
export const signOut = async () => { FS.user = null; try { localStorage.setItem('__authOut', '1'); } catch {} FS.authCb(null); };
export class GoogleAuthProvider {}
export const doc = (db, p) => ({ path: p, kind: 'doc' });
export const collection = (db, n) => ({ coll: n, kind: 'coll' });
export const orderBy = (f, d) => ({ orderBy: [f, d] });
export const limit = n => ({ limit: n });
export const query = (ref, c) => ({ ...ref, ...c });
export class FieldPath { constructor(...s) { if (s.some(x => x === '')) throw new Error('empty field path segment'); this.s = s; } }
export const deleteField = () => DEL;
export const arrayUnion = (...a) => ({ __union: a });
export const arrayRemove = (...a) => ({ __remove: a });
const snapDoc = (d, p) => ({ exists: () => p in d, id: p.split('/').pop(), data: () => clone(d[p]) });
export const getDoc = async r => { const d = view(); if (!FS.online && !(r.path in d)) { const e = new Error('offline'); e.code = 'unavailable'; throw e; } return snapDoc(d, r.path); };
export const setDoc = (r, d, o) => write({ t: 'set', p: r.path, d: clone(d), merge: !!(o && o.merge) });
export const deleteDoc = r => write({ t: 'delete', p: r.path });
export const updateDoc = (r, ...args) => { const ops = []; for (let i = 0; i < args.length; i += 2) ops.push([args[i].s, args[i + 1] === DEL ? DEL : clone(args[i + 1])]); return write({ t: 'update', p: r.path, ops }); };
export const writeBatch = () => { const sets = []; return { set: (r, d) => sets.push([r.path, clone(d)]), commit: () => write({ t: 'batch', sets }) }; };
export const onSnapshot = (ref, ...rest) => {
  let opts = {}; if (typeof rest[0] !== 'function') opts = rest.shift(); const [cb, err] = rest;
  const run = () => {
    const d = view();
    if (ref.kind === 'doc') { if (FS.stage[ref.path]) return; return cb(snapDoc(d, ref.path)); }
    if (FS.stage[ref.coll] === 'hold') return;
    let ds = FS.stage[ref.coll] === 'empty' ? [] : Object.keys(d).filter(p => p.startsWith(ref.coll + '/'));
    if (ref.orderBy) { const [f, dir] = ref.orderBy; ds = ds.filter(p => d[p][f] !== undefined).sort((a, b) => (d[a][f] < d[b][f] ? -1 : 1) * (dir === 'desc' ? -1 : 1)); }
    if (ref.limit) ds = ds.slice(0, ref.limit);
    cb({ docs: ds.map(p => snapDoc(d, p)), metadata: { fromCache: FS.stage[ref.coll] === 'empty' || !FS.gotServer } });
  };
  const l = () => setTimeout(run, 0); FS.listeners.push(l); l(); return () => {};
};
