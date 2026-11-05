// Funções compartilhadas. As credenciais ficam em variáveis de ambiente (nunca no navegador).
const cat = require('./catalogo.json');
const { lerProdutos } = require('./_dados');
const J = (c, o) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
const pv = p => p.precoPromo || p.preco;
const ME = () => process.env.ME_SANDBOX === '1' ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';

// Valida a sacola e busca preço/peso no catálogo do servidor (o navegador não decide preço).
async function linhas(items, ev) {
  if (!Array.isArray(items) || !items.length) throw new Error('Sacola vazia');
  const prods = await lerProdutos(ev);
  return items.map(i => {
    const p = prods.find(x => x.id === i.id && x.ativo !== false), q = Math.floor(+i.q);
    if (!p || !(q >= 1 && q <= 50)) throw new Error('Item indisponível');
    if (p.estoque < q) throw new Error('Sem estoque: ' + p.nome);
    return { p, q };
  });
}

// Cotação de frete. Usa a SuperFrete quando SF_TOKEN existe (padrão) ou o Melhor Envio quando só ME_TOKEN existe.
// Para forçar um deles: FRETE_PROVEDOR = superfrete | melhorenvio
const ua = () => 'Dominnion (' + (process.env.CONTATO_EMAIL || 'contato@exemplo.com') + ')';
const provedor = () => process.env.FRETE_PROVEDOR || (process.env.SF_TOKEN ? 'superfrete' : 'melhorenvio');

async function cotarSuperFrete(cep, ls) {
  const base = process.env.SF_SANDBOX === '1' ? 'https://sandbox.superfrete.com' : 'https://api.superfrete.com';
  const total = ls.reduce((a, { p, q }) => a + pv(p) * q, 0);
  const r = await fetch(base + '/api/v0/calculator', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.SF_TOKEN, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': ua() },
    body: JSON.stringify({
      from: { postal_code: process.env.CEP_ORIGEM }, to: { postal_code: cep },
      services: process.env.SF_SERVICOS || '1,2,17',            // 1 = PAC, 2 = SEDEX, 17 = Mini Envios
      options: { own_hand: false, receipt: false, insurance_value: +total.toFixed(2), use_insurance_value: false },
      products: ls.map(({ p, q }) => ({ quantity: q, height: p.altura, width: p.largura, length: p.comprimento, weight: p.peso }))
    })
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(d)) { console.error('SuperFrete', r.status, JSON.stringify(d)); throw new Error('SuperFrete indisponível'); }
  return d.filter(s => !s.error && s.price != null).map(s => ({
    id: s.id, nome: ((s.company && s.company.name) ? s.company.name + ' ' : '') + s.name,
    valor: +s.price, prazo: s.delivery_time || (s.delivery_range && s.delivery_range.max) || 0
  })).sort((a, b) => a.valor - b.valor);
}

async function cotarMelhorEnvio(cep, ls) {
  const r = await fetch(ME() + '/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.ME_TOKEN, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': ua() },
    body: JSON.stringify({
      from: { postal_code: process.env.CEP_ORIGEM }, to: { postal_code: cep },
      products: ls.map(({ p, q }) => ({ id: p.id, width: p.largura, height: p.altura, length: p.comprimento, weight: p.peso, insurance_value: pv(p), quantity: q }))
    })
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(d)) throw new Error('Melhor Envio indisponível');
  return d.filter(s => !s.error && (s.custom_price || s.price)).map(s => ({
    id: s.id, nome: ((s.company && s.company.name) ? s.company.name + ' ' : '') + s.name,
    valor: +(s.custom_price || s.price), prazo: s.custom_delivery_time || s.delivery_time
  })).sort((a, b) => a.valor - b.valor);
}

async function cotar(cep, ls) {
  if (!process.env.CEP_ORIGEM) throw new Error('Frete não configurado');
  if (provedor() === 'superfrete') { if (!process.env.SF_TOKEN) throw new Error('Frete não configurado'); return cotarSuperFrete(cep, ls); }
  if (!process.env.ME_TOKEN) throw new Error('Frete não configurado');
  return cotarMelhorEnvio(cep, ls);
}
module.exports = { cat, J, pv, linhas, cotar };
