// The expression language of rules.json `check` strings, and a reference evaluator.
// The engine (WP-8) can import this file or port it; check.mjs uses it to prove every
// rule parses and evaluates.
//
// evaluate(check, facts) -> { result: 'pass' | 'fail' | 'missing', missing?: string[] }

export const LANGUAGE = {
  literals: ['numbers (100000, 0.5)', "strings in single quotes ('Yes')", 'true', 'false', "lists ['a', 'b']"],
  names: 'a fact name (rules.json facts); inside a list function, the current item\'s properties come first (e.g. abn, type, start); item.prop and list[0].prop also work',
  operators: ['or', 'and', 'not', '== != < <= > >=', 'in <list>', '+ - * /', '( )'],
  functions: {
    'count(list)': 'number of items',
    'count(list, cond)': 'number of items where cond is true',
    'all(list, cond)': 'true when cond holds for every item (true for an empty list)',
    'any(list, cond)': 'true when cond holds for at least one item',
    'sum(list, expr)': 'sum of expr over the items',
    'all_values(object, cond)': 'cond over every value of an object, with the value as `value`',
    'abn_valid(x)': 'true when x is an 11-digit ABN with a valid checksum (spaces ignored)',
    'months_between(a, b)': 'whole calendar months from date a to date b, counting a part month as a month',
    'is_set(x)': 'false when the fact is absent or empty; never reports it missing',
    'is_integer(x)': 'true for whole numbers',
    'abs(x)': 'absolute value',
  },
  dates: 'ISO 8601 strings (YYYY-MM-DD); comparisons between dates compare them as dates',
  missing: 'a check that reads an absent fact (other than inside is_set) evaluates to `missing`',
};

class Missing extends Error {
  constructor(name) { super(`missing fact: ${name}`); this.fact = name; }
}

function tokenize(src) {
  const re = /\s*(?:(\d+(?:\.\d+)?)|'((?:[^'\\]|\\.)*)'|([A-Za-z_][A-Za-z0-9_]*)|(==|!=|<=|>=|[<>()+\-*/,.[\]]))/y;
  const out = [];
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new SyntaxError(`unexpected input at ${i}: ${src.slice(i, i + 20)}`);
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'str', v: m[2].replace(/\\(.)/g, '$1') });
    else if (m[3] !== undefined) out.push({ t: ['and', 'or', 'not', 'in', 'true', 'false'].includes(m[3]) ? m[3] : 'id', v: m[3] });
    else out.push({ t: 'op', v: m[4] });
    i = re.lastIndex;
  }
  return out;
}

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const expect = (v) => { if (!isOp(v)) throw new SyntaxError(`expected ${v} in: ${src}`); p++; };

  const orExpr = () => { let l = andExpr(); while (peek()?.t === 'or') { p++; l = { k: 'or', l, r: andExpr() }; } return l; };
  const andExpr = () => { let l = notExpr(); while (peek()?.t === 'and') { p++; l = { k: 'and', l, r: notExpr() }; } return l; };
  const notExpr = () => { if (peek()?.t === 'not') { p++; return { k: 'not', e: notExpr() }; } return cmp(); };
  const cmp = () => {
    const l = add();
    if (peek()?.t === 'in') { p++; return { k: 'in', l, r: add() }; }
    if (peek()?.t === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(peek().v)) { const op = toks[p++].v; return { k: 'cmp', op, l, r: add() }; }
    return l;
  };
  const add = () => { let l = mul(); while (isOp('+') || isOp('-')) { const op = toks[p++].v; l = { k: 'arith', op, l, r: mul() }; } return l; };
  const mul = () => { let l = unary(); while (isOp('*') || isOp('/')) { const op = toks[p++].v; l = { k: 'arith', op, l, r: unary() }; } return l; };
  const unary = () => { if (isOp('-')) { p++; return { k: 'arith', op: '-', l: { k: 'lit', v: 0 }, r: unary() }; } return postfix(); };
  const postfix = () => {
    let e = primary();
    for (;;) {
      if (isOp('.')) { p++; const t = toks[p++]; if (t?.t !== 'id') throw new SyntaxError(`expected property in: ${src}`); e = { k: 'prop', e, name: t.v }; }
      else if (isOp('[')) { p++; const idx = orExpr(); expect(']'); e = { k: 'index', e, idx }; }
      else return e;
    }
  };
  const primary = () => {
    const t = toks[p++];
    if (!t) throw new SyntaxError(`unexpected end of: ${src}`);
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'true' || t.t === 'false') return { k: 'lit', v: t.t === 'true' };
    if (t.t === 'op' && t.v === '(') { const e = orExpr(); expect(')'); return e; }
    if (t.t === 'op' && t.v === '[') {
      const items = [];
      if (!isOp(']')) { items.push(orExpr()); while (isOp(',')) { p++; items.push(orExpr()); } }
      expect(']');
      return { k: 'list', items };
    }
    if (t.t === 'id') {
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) { args.push(orExpr()); while (isOp(',')) { p++; args.push(orExpr()); } }
        expect(')');
        if (!(t.v in FUNCS)) throw new SyntaxError(`unknown function ${t.v} in: ${src}`);
        return { k: 'call', name: t.v, args };
      }
      return { k: 'name', name: t.v };
    }
    throw new SyntaxError(`unexpected ${t.v} in: ${src}`);
  };

  const ast = orExpr();
  if (p !== toks.length) throw new SyntaxError(`trailing input in: ${src}`);
  return ast;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => typeof v === 'string' && DATE.test(v);

export function abnValid(x) {
  const d = String(x ?? '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = d.split('').map(Number);
  digits[0] -= 1;
  return digits.reduce((s, n, i) => s + n * w[i], 0) % 89 === 0;
}

export function monthsBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 > d1) months += 1;
  return months;
}

const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const FUNCS = {
  count: (ctx, [list, cond]) => { const l = asList(ev(list, ctx)); return cond ? l.filter((it) => truthy(ev(cond, item(ctx, it, l)))).length : l.length; },
  all: (ctx, [list, cond]) => { const l = asList(ev(list, ctx)); return l.every((it) => truthy(ev(cond, item(ctx, it, l)))); },
  any: (ctx, [list, cond]) => { const l = asList(ev(list, ctx)); return l.some((it) => truthy(ev(cond, item(ctx, it, l)))); },
  sum: (ctx, [list, expr]) => { const l = asList(ev(list, ctx)); return l.reduce((s, it) => s + Number(ev(expr, item(ctx, it, l))), 0); },
  all_values: (ctx, [obj, cond]) => Object.values(ev(obj, ctx) ?? {}).every((value) => truthy(ev(cond, item(ctx, { value })))),
  abn_valid: (ctx, [x]) => abnValid(ev(x, ctx)),
  months_between: (ctx, [a, b]) => monthsBetween(ev(a, ctx), ev(b, ctx)),
  is_set: (ctx, [x]) => { try { return !empty(ev(x, ctx)); } catch (e) { if (e instanceof Missing) return false; throw e; } },
  is_integer: (ctx, [x]) => Number.isInteger(ev(x, ctx)),
  abs: (ctx, [x]) => Math.abs(ev(x, ctx)),
};

const asList = (v) => { if (!Array.isArray(v)) throw new TypeError('expected a list'); return v; };
const truthy = (v) => v === true;
// Inside a list function the item's own properties come first. A name that any item of the
// list has is the item's, so an item without it is missing rather than falling through to a
// top-level fact of the same name.
const item = (ctx, it, list) => ({ scopes: [it, ...ctx.scopes], own: new Set((list ?? [it]).flatMap((x) => (x && typeof x === 'object' ? Object.keys(x) : []))) });

function lookup(name, ctx) {
  if (ctx.own?.has(name) && !Object.prototype.hasOwnProperty.call(ctx.scopes[0] ?? {}, name)) throw new Missing(name);
  for (const s of ctx.scopes) {
    if (s && typeof s === 'object' && Object.prototype.hasOwnProperty.call(s, name)) {
      const v = s[name];
      if (empty(v) && !Array.isArray(v)) throw new Missing(name);
      return v;
    }
  }
  throw new Missing(name);
}

function compare(op, a, b) {
  if (isDate(a) && isDate(b)) { a = Date.parse(a); b = Date.parse(b); }
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
  }
  throw new Error(op);
}

function ev(n, ctx) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'list': return n.items.map((i) => ev(i, ctx));
    case 'name': return lookup(n.name, ctx);
    case 'prop': { const o = ev(n.e, ctx); if (o == null || !(n.name in o) || empty(o[n.name])) throw new Missing(n.name); return o[n.name]; }
    case 'index': { const o = ev(n.e, ctx); const i = ev(n.idx, ctx); if (!Array.isArray(o) || o[i] === undefined) throw new Missing(`[${i}]`); return o[i]; }
    case 'or': return truthy(ev(n.l, ctx)) || truthy(ev(n.r, ctx));
    case 'and': return truthy(ev(n.l, ctx)) && truthy(ev(n.r, ctx));
    case 'not': return !truthy(ev(n.e, ctx));
    case 'in': return asList(ev(n.r, ctx)).includes(ev(n.l, ctx));
    case 'cmp': return compare(n.op, ev(n.l, ctx), ev(n.r, ctx));
    case 'arith': {
      const a = ev(n.l, ctx), b = ev(n.r, ctx);
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : a / b;
    }
    case 'call': return FUNCS[n.name](ctx, n.args);
  }
  throw new Error(`bad node ${n.k}`);
}

export function evaluate(check, facts) {
  const ast = typeof check === 'string' ? parse(check) : check;
  try {
    return { result: truthy(ev(ast, { scopes: [facts] })) ? 'pass' : 'fail' };
  } catch (e) {
    if (e instanceof Missing) return { result: 'missing', missing: [e.fact] };
    throw e;
  }
}
