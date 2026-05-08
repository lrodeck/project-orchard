// Expression engine — evaluates formulas like:
//   5 + step*0.1
//   pool.energy * 0.2
//   min(100, pool.gold / 10)
//   step > 30 && pool.gems >= 50
//
// Context exposed:
//   step             — current simulation step
//   pool.<name>      — current level of a pool resource
//   prod.<name>      — total production of resource last step
//   cons.<name>      — total consumption of resource last step
//   functions: min, max, abs, floor, ceil, round, clamp, sqrt, pow, log, exp, sin, cos, if(c,a,b)
//   constants: pi, e, true, false
//
// Tiny recursive-descent parser + AST evaluator. Caches compiled ASTs per source.

(function(global){
  const cache = new Map();

  function tokenize(src){
    const toks = [];
    let i = 0;
    const re = /\s*([0-9]+\.?[0-9]*|[a-zA-Z_][a-zA-Z0-9_.]*|<=|>=|==|!=|&&|\|\||[+\-*/%(),<>!?:])/y;
    while(i < src.length){
      re.lastIndex = i;
      const m = re.exec(src);
      if(!m){ throw new Error('Unexpected character at '+i+': '+src.slice(i)); }
      toks.push(m[1]);
      i = re.lastIndex;
    }
    return toks;
  }

  function parse(src){
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const eat = (t) => { if(toks[p]!==t) throw new Error('Expected '+t+' got '+toks[p]); p++; };
    function expr(){ return ternary(); }
    function ternary(){
      const c = or();
      if(peek()==='?'){ p++; const a = expr(); eat(':'); const b = expr(); return ['?', c, a, b]; }
      return c;
    }
    function or(){ let l = and(); while(peek()==='||'){ p++; l = ['||', l, and()]; } return l; }
    function and(){ let l = eq(); while(peek()==='&&'){ p++; l = ['&&', l, eq()]; } return l; }
    function eq(){ let l = cmp(); while(peek()==='=='||peek()==='!='){ const op=toks[p++]; l=[op,l,cmp()]; } return l; }
    function cmp(){ let l = add(); while(['<','>','<=','>='].includes(peek())){ const op=toks[p++]; l=[op,l,add()]; } return l; }
    function add(){ let l = mul(); while(peek()==='+'||peek()==='-'){ const op=toks[p++]; l=[op,l,mul()]; } return l; }
    function mul(){ let l = unary(); while(peek()==='*'||peek()==='/'||peek()==='%'){ const op=toks[p++]; l=[op,l,unary()]; } return l; }
    function unary(){ if(peek()==='-'){ p++; return ['neg', unary()]; } if(peek()==='!'){ p++; return ['not', unary()]; } return atom(); }
    function atom(){
      const t = toks[p];
      if(t==='(') { p++; const e = expr(); eat(')'); return e; }
      if(/^[0-9]/.test(t)){ p++; return ['num', parseFloat(t)]; }
      if(/^[a-zA-Z_]/.test(t)){
        p++;
        if(peek()==='('){
          p++;
          const args = [];
          if(peek()!==')'){ args.push(expr()); while(peek()===','){ p++; args.push(expr()); } }
          eat(')');
          return ['call', t, args];
        }
        return ['var', t];
      }
      throw new Error('Unexpected token: '+t);
    }
    const ast = expr();
    if(p < toks.length) throw new Error('Trailing tokens: '+toks.slice(p).join(' '));
    return ast;
  }

  const FNS = {
    min: Math.min, max: Math.max, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
    round: Math.round, sqrt: Math.sqrt, pow: Math.pow, log: Math.log, exp: Math.exp,
    sin: Math.sin, cos: Math.cos,
    clamp: (x,a,b) => Math.max(a, Math.min(b, x)),
    if: (c,a,b) => c ? a : b,
  };
  const CONSTS = { pi: Math.PI, e: Math.E, true: 1, false: 0 };

  function evalAst(ast, ctx){
    const op = ast[0];
    switch(op){
      case 'num': return ast[1];
      case 'var': {
        const name = ast[1];
        if(name in CONSTS) return CONSTS[name];
        if(name === 'step') return ctx.step || 0;
        if(name.startsWith('pool.')) return (ctx.pool||{})[name.slice(5)] || 0;
        if(name.startsWith('prod.')) return (ctx.prod||{})[name.slice(5)] || 0;
        if(name.startsWith('cons.')) return (ctx.cons||{})[name.slice(5)] || 0;
        if(ctx.vars && name in ctx.vars) return ctx.vars[name];
        return 0;
      }
      case 'call': {
        const fn = FNS[ast[1]];
        if(!fn) throw new Error('Unknown function: '+ast[1]);
        return fn.apply(null, ast[2].map(a => evalAst(a, ctx)));
      }
      case 'neg': return -evalAst(ast[1], ctx);
      case 'not': return evalAst(ast[1], ctx) ? 0 : 1;
      case '+': return evalAst(ast[1],ctx) + evalAst(ast[2],ctx);
      case '-': return evalAst(ast[1],ctx) - evalAst(ast[2],ctx);
      case '*': return evalAst(ast[1],ctx) * evalAst(ast[2],ctx);
      case '/': { const b = evalAst(ast[2],ctx); return b===0 ? 0 : evalAst(ast[1],ctx)/b; }
      case '%': { const b = evalAst(ast[2],ctx); return b===0 ? 0 : evalAst(ast[1],ctx)%b; }
      case '<': return evalAst(ast[1],ctx) <  evalAst(ast[2],ctx) ? 1 : 0;
      case '>': return evalAst(ast[1],ctx) >  evalAst(ast[2],ctx) ? 1 : 0;
      case '<=': return evalAst(ast[1],ctx) <= evalAst(ast[2],ctx) ? 1 : 0;
      case '>=': return evalAst(ast[1],ctx) >= evalAst(ast[2],ctx) ? 1 : 0;
      case '==': return evalAst(ast[1],ctx) === evalAst(ast[2],ctx) ? 1 : 0;
      case '!=': return evalAst(ast[1],ctx) !== evalAst(ast[2],ctx) ? 1 : 0;
      case '&&': return evalAst(ast[1],ctx) && evalAst(ast[2],ctx) ? 1 : 0;
      case '||': return evalAst(ast[1],ctx) || evalAst(ast[2],ctx) ? 1 : 0;
      case '?': return evalAst(ast[1],ctx) ? evalAst(ast[2],ctx) : evalAst(ast[3],ctx);
    }
    throw new Error('Bad op '+op);
  }

  function compile(src){
    if(cache.has(src)) return cache.get(src);
    try {
      const ast = parse(String(src).trim());
      const fn = (ctx) => {
        try { return evalAst(ast, ctx); } catch(e){ return 0; }
      };
      fn.ok = true;
      cache.set(src, fn);
      return fn;
    } catch(e){
      const fn = (ctx) => 0;
      fn.ok = false; fn.error = e.message;
      cache.set(src, fn);
      return fn;
    }
  }

  // Resolve a value: if it's a string starting with '=' it's a formula, else a number.
  function resolve(value, ctx, fallback){
    if(value == null || value === '') return fallback;
    if(typeof value === 'number') return value;
    const s = String(value).trim();
    if(s.startsWith('=')){
      const fn = compile(s.slice(1));
      const v = fn(ctx);
      return (typeof v === 'number' && !isNaN(v)) ? v : fallback;
    }
    const n = parseFloat(s);
    return isNaN(n) ? fallback : n;
  }

  function isFormula(value){
    return typeof value === 'string' && value.trim().startsWith('=');
  }

  function validate(value){
    if(!isFormula(value)) return { ok: true };
    const fn = compile(String(value).trim().slice(1));
    return fn.ok ? { ok: true } : { ok: false, error: fn.error };
  }

  global.OrchardExpr = { compile, resolve, isFormula, validate };
})(window);
