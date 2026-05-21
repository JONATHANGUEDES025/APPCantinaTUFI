const main=document.getElementById('main');
const nav=document.getElementById('nav');
const mobileNav=document.getElementById('mobileNav');
const modalRoot=document.getElementById('modalRoot');
const operatorLabel=document.getElementById('operatorLabel');
[
  'pSearch','pCategory','pStatus','productsTable','productDetails',
  'f_name','f_category','f_price','f_cost','f_unit','f_min','f_qty','f_active',
  's_type','s_qty_label','s_help','s_qty','s_notes',
  'saleSearch','saleCat','saleCategories','catalog','cart','payment','totals',
  'debtorWrap','receivedWrap','change','saleOp','debtor','customer','discount','received','notes',
  'saleFilter','dateFrom','dateTo','saleStatus','payFilter','salesTable',
  'fiadoView','fiadosTable','settleMethod',
  'rFrom','rTo','reportBox'
].forEach(id=>{
  if(!(id in window)){
    Object.defineProperty(window,id,{configurable:true,get(){return document.getElementById(id)}});
  }
});

const pages=[
  ['dashboard','Dashboard'],['sale','Caixa'],['products','Produtos'],['sales','Vendas'],['fiados','Fiados'],['stock','Estoque'],['reports','Relatorios'],['system','Sistema']
];
const state={page:'dashboard',products:[],categories:[],cart:[],selectedProduct:null,operator:localStorage.getItem('cantina.operator')||'Operador'};
operatorLabel.textContent=state.operator;
function bootNav(){nav.innerHTML=pages.map(p=>`<button data-page="${p[0]}">${p[1]}</button>`).join(''); mobileNav.innerHTML=pages.map(p=>`<option value="${p[0]}">${p[1]}</option>`).join(''); nav.querySelectorAll('button').forEach(b=>b.onclick=()=>showPage(b.dataset.page)); mobileNav.onchange=()=>showPage(mobileNav.value)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function jsarg(v){return esc(JSON.stringify(String(v??'')))}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function dt(v){if(!v)return'-'; const d=new Date(v); return isNaN(d)?esc(v):d.toLocaleString('pt-BR')}
function today(){return new Date().toISOString().slice(0,10)}
async function api(path,opt={}){const r=await fetch(path,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const d=await r.json(); if(!r.ok||d.error)throw new Error(d.error||'Erro ao processar.'); return d}
async function action(work){try{return await work()}catch(e){alert(e.message||'Erro ao processar.')}}
function toast(msg){const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2400)}
function title(h,s,actions=''){return `<div class="topbar"><div class="title"><h1>${h}</h1><p>${s}</p></div><div class="toolbar">${actions}</div></div>`}
function activate(page){state.page=page; mobileNav.value=page; nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.page===page))}
async function showPage(page){try{activate(page); if(page==='dashboard')await renderDashboard(); if(page==='sale')await renderSale(); if(page==='products')await renderProducts(); if(page==='sales')await renderSales(); if(page==='fiados')await renderFiados(); if(page==='stock')await renderStock(); if(page==='reports')await renderReports(); if(page==='system')await renderSystem()}catch(e){alert(e.message)}}
function table(headers,rows){if(!rows.length)return '<div class="empty">Nenhum registro encontrado.</div>'; return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
async function refreshMeta(){state.categories=await api('/api/categories')}
function statusPill(p){if(!p.active)return'<span class="pill bad">Inativo</span>'; if(p.quantity<=0)return'<span class="pill bad">Sem estoque</span>'; if(p.quantity<=p.min_stock)return'<span class="pill warn">Estoque baixo</span>'; return'<span class="pill ok">Ativo</span>'}
