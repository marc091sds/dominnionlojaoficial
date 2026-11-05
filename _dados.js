// Guarda produtos, fotos e pedidos no Netlify Blobs (já incluso no Netlify, sem banco de dados para contratar).
const { getStore, connectLambda } = require('@netlify/blobs');
const seed = require('./catalogo.json');

// Abre um "armário" (store). Se o Netlify não configurar sozinho, usa BLOBS_SITE_ID + BLOBS_TOKEN (opcional).
const st = (ev, nome) => {
  try { if (ev && ev.blobs) connectLambda(ev); return getStore({ name: nome, consistency: 'strong' }); }
  catch (err) {
    if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) return getStore({ name: nome, siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN });
    throw err;
  }
};
async function ler(ev) {
  try { const l = await st(ev, 'loja').get('produtos', { type: 'json' }); if (Array.isArray(l)) return { lista: l, fonte: 'painel' }; }
  catch (err) { console.error('blobs', err.message); return { lista: JSON.parse(JSON.stringify(seed.produtos)), fonte: 'erro' }; }
  return { lista: JSON.parse(JSON.stringify(seed.produtos)), fonte: 'padrao' };   // painel ainda não usado: vale o catalogo.json
}
const lerProdutos = async ev => (await ler(ev)).lista;
const salvarProdutos = (ev, l) => st(ev, 'loja').setJSON('produtos', l);
module.exports = { st, ler, lerProdutos, salvarProdutos, seed };
