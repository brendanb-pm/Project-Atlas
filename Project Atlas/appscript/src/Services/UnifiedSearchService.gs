/** Bounded, read-only command palette search over authorized tenant records. */
function UnifiedSearchService_(dependencies){
  dependencies=dependencies||{};
  this.sources=dependencies.sources||{};
  this.limit=Math.min(25,Math.max(1,Number(dependencies.limit||15)));
}
UnifiedSearchService_.prototype.source_=function(name){
  if(this.sources[name])return this.sources[name];
  if(['Customer','RFQ','Quote','Job','Invoice'].indexOf(name)!==-1)return new MvpService_(name);
  if(name==='Vendor')return new VendorRepository_();
  if(name==='PurchaseRequest')return new PurchaseApprovalRepository_();
  if(name==='Firearm')return new SerializedFirearmRepository_();
  return null;
};
UnifiedSearchService_.prototype.search=function(query,context,limit){
  var term=String(query||'').trim().toLowerCase(),maximum=Math.min(this.limit,Math.max(1,Number(limit||this.limit))),capabilities=(context&&context.capabilities)||[],self=this,items=[],sources=[];
  if(term.length<2)return {items:[],query:term,limit:maximum,bounded:true,minimumQueryLength:2};
  function can(capability){return capabilities.indexOf(capability)!==-1;}
  function add(type,capability,route,fields,label,secondary,module){var required=Array.isArray(capability)?capability:[capability];if(!required.some(can)||module&&(!context.enabledModules||context.enabledModules.indexOf(module)===-1))return;sources.push({type:type,route:route,fields:fields,label:label,secondary:secondary,reader:self.source_(type)});}
  add('Customer','CORE_RECORD_READ','customers',['id','name','primaryContact','email'],function(r){return r.name||'Customer';},function(r){return [r.primaryContact,r.email,r.status].filter(Boolean).join(' · ');});
  add('RFQ','RFQ_READ','rfqs',['id','customerRfqNumber','description','status'],function(r){return r.customerRfqNumber||r.description||'RFQ';},function(r){return [r.description,r.status].filter(Boolean).join(' · ');});
  add('Quote','RFQ_READ','quotes',['id','quoteNumber','status','customerId'],function(r){return r.quoteNumber||r.id;},function(r){return ['Quote',r.status].filter(Boolean).join(' · ');});
  add('Job','OPERATIONS_READ','jobs',['id','partId','description','status'],function(r){return [r.id,r.partId||r.description].filter(Boolean).join(' — ');},function(r){return r.status||'Job / Work Order';});
  add('Invoice','FINANCE_READ','invoices',['id','invoiceNumber','status','jobId'],function(r){return r.invoiceNumber||r.id;},function(r){return [r.status,r.jobId].filter(Boolean).join(' · ');});
  add('PurchaseRequest',['PURCHASE_REQUEST','PURCHASE_APPROVE'],'purchasing',['id','description','vendor','status'],function(r){return r.description||r.id;},function(r){return [r.vendor,r.status].filter(Boolean).join(' · ');});
  add('Vendor',['QUOTE_COST_READ','PURCHASE_REQUEST','PURCHASE_APPROVE'],'vendors',['id','name','supplyType','status'],function(r){return r.name||'Vendor';},function(r){return [r.supplyType,r.status].filter(Boolean).join(' · ');});
  add('Firearm','FIREARMS_READ','firearms',['id','serialNumber','manufacturer','model'],function(r){return [r.manufacturer,r.model,r.serialNumber].filter(Boolean).join(' ');},function(){return 'Serialized firearm';},'FIREARMS');
  sources.forEach(function(source){if(items.length>=maximum||!source.reader)return;var rows=source.type==='Vendor'&&source.reader.forTenant?source.reader.forTenant(context.tenantId):source.reader.list();(rows||[]).filter(function(row){return String(row.tenantId||row.securityTenantId||context.tenantId)===String(context.tenantId);}).filter(function(row){return source.fields.some(function(field){return String(row[field]||'').toLowerCase().indexOf(term)!==-1;});}).slice(0,maximum-items.length).forEach(function(row){var job=source.type==='Job',href=job?'?route=job&jobId='+encodeURIComponent(row.id):'?route='+source.route+'&id='+encodeURIComponent(row.id);items.push({type:source.type==='PurchaseRequest'?'Purchase Request':source.type,label:source.label(row),secondary:source.secondary(row),status:row.status||'',route:job?'job':source.route,recordId:row.id,href:href});});});
  return {items:items,query:term,limit:maximum,bounded:true,hasMore:items.length===maximum};
};
