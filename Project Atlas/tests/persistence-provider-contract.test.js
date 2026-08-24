const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const context=vm.createContext({console,Date,JSON,String,Number,Math,Object,Array,Error,encodeURIComponent,decodeURIComponent,PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}});
['Utilities/Errors.gs','ConfigPersistence.gs','Repository/PersistenceProvider.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context));

function memoryRepository(rows){
  let records=rows.map(row=>Object.assign({},row)); let listCalls=0;
  return {
    list(){listCalls+=1;return records.map(row=>Object.assign({},row));},
    findById(id){const row=records.find(item=>String(item.id)===String(id));if(!row)throw new context.VmosNotFoundError_('missing');return Object.assign({},row);},
    findFirstByFields(criteria){return records.find(row=>Object.keys(criteria).every(key=>String(row[key])===String(criteria[key])));},
    insert(record){records.push(Object.assign({},record));return Object.assign({},record);},
    insertUnique(record){if(records.some(row=>String(row.id)===String(record.id)))throw new context.VmosConflictError('duplicate');return this.insert(record);},
    updateById(id,changes){const row=records.find(item=>String(item.id)===String(id));if(!row)throw new context.VmosNotFoundError_('missing');Object.keys(changes).forEach(key=>row[key]=changes[key]);return Object.assign({},row);},
    calls(){return listCalls;}
  };
}
const definition={fields:{id:['ID'],tenantId:['Tenant ID'],version:['Version'],name:['Name'],occurredAt:['Occurred At'],commandId:['Command ID']}};
const raw=memoryRepository([{id:'A',tenantId:'TENANT-A',version:1,name:'Zulu',occurredAt:'2026-08-10T10:00:00Z'},{id:'B',tenantId:'TENANT-A',version:1,name:'Alpha',occurredAt:'2026-08-11T10:00:00Z'},{id:'C',tenantId:'TENANT-B',version:1,name:'Foreign',occurredAt:'2026-08-12T10:00:00Z'}]);
const provider=new context.SheetsPersistenceProvider_({entityName:'TestRecord',definition,tenantField:'tenantId',repository:raw});
const scope=context.createTenantPersistenceScope_({authoritative:true,tenantId:'TENANT-A',userId:'USER-A'});
assert.equal(provider.capabilities().atomicTransactions,false);assert.equal(provider.capabilities().cursorPagination,true);
assert.throws(()=>context.createTenantPersistenceScope_({tenantId:'TENANT-A'}),error=>error.code==='AUTHORIZATION_ERROR');
assert.throws(()=>provider.listForScope(scope,{}),error=>error.code==='VALIDATION_ERROR');
const first=provider.listForScope(scope,{limit:1,orderBy:{field:'name',direction:'ASC'}});assert.deepEqual(first.items.map(row=>row.id),['B']);assert.equal(first.hasMore,true);assert.ok(first.nextCursor);
const second=provider.listForScope(scope,{limit:1,orderBy:{field:'name',direction:'ASC'},cursor:first.nextCursor});assert.deepEqual(second.items.map(row=>row.id),['A']);assert.equal(second.hasMore,false);assert.equal(raw.calls(),2,'each bounded request delegates to the underlying repository once');
assert.throws(()=>provider.getForScope(scope,'C'),error=>error.code==='AUTHORIZATION_ERROR');
assert.equal(provider.existsForScope(scope,'missing'),false);
const created=provider.createForScope(scope,{id:'D',name:'Delta',version:1,commandId:'CMD-1'},{idempotencyCriteria:{commandId:'CMD-1'}});assert.equal(created.replayed,false);assert.equal(created.record.tenantId,'TENANT-A');
const replay=provider.createForScope(scope,{id:'E',name:'Ignored',version:1,commandId:'CMD-1'},{idempotencyCriteria:{commandId:'CMD-1'}});assert.equal(replay.replayed,true);assert.equal(replay.record.id,'D');
assert.throws(()=>provider.createForScope(scope,{id:'F',tenantId:'TENANT-B',name:'Foreign',version:1}),error=>error.code==='AUTHORIZATION_ERROR');
assert.throws(()=>provider.updateForScope(scope,'B',{name:'Changed'},{expectedVersion:2}),error=>error.code==='CONFLICT');
assert.equal(provider.updateForScope(scope,'B',{name:'Changed'},{expectedVersion:1}).name,'Changed');
assert.throws(()=>provider.updateForScope(scope,'B',{tenantId:'TENANT-B'}),error=>error.code==='VALIDATION_ERROR');
assert.throws(()=>provider.runInTransaction(()=>{}),error=>error.code==='TRANSACTION_UNSUPPORTED');
const events=new context.SheetsPersistenceProvider_({entityName:'Event',definition,tenantField:'tenantId',appendOnly:true,repository:memoryRepository([])});
assert.equal(events.appendForScope(scope,{id:'EV-1',occurredAt:'2026-08-12T00:00:00Z',version:1}).id,'EV-1');
assert.throws(()=>events.updateForScope(scope,'EV-1',{name:'rewrite'}),error=>error.code==='TRANSACTION_UNSUPPORTED');
const registry=new context.AtlasPersistenceProviderRegistry_({config:{provider:'SHEETS'},sheetsFactory:options=>({kind:'SHEETS',options})});assert.equal(registry.create({entityName:'Customer'}).kind,'SHEETS');
assert.throws(()=>new context.AtlasPersistenceProviderRegistry_({config:{provider:'POSTGRESQL'}}).create({entityName:'Customer'}),error=>error.code==='PROVIDER_UNAVAILABLE');
assert.throws(()=>new context.AtlasPersistenceProviderRegistry_({config:{provider:'UNKNOWN'}}).create({}),error=>error.code==='CONFIGURATION_ERROR');
const identitySource=fs.readFileSync(path.join(base,'Repository','IdentityRepositories.gs'),'utf8'),operationalSource=fs.readFileSync(path.join(base,'Repository','OperationalRepositories.gs'),'utf8'),entitySource=fs.readFileSync(path.join(base,'Repository','SheetsRepository.gs'),'utf8');
assert.match(identitySource,/createAtlasPersistenceProvider_/);assert.match(identitySource,/appendForContext/);assert.match(operationalSource,/createAtlasPersistenceProvider_/);assert.match(entitySource,/createAtlasPersistenceProvider_/);
const scopedStores=[];
context.SpreadsheetApp={openById:()=>({})};
context.getVmosConfig_=()=>({spreadsheetId:'fixture'});
context.createAtlasPersistenceProvider_=options=>{const store=memoryRepository([]),adapter=new context.SheetsPersistenceProvider_(Object.assign({},options,{repository:store}));scopedStores.push(adapter);return adapter;};
vm.runInContext(fs.readFileSync(path.join(base,'ConfigIdentity.gs'),'utf8'),context);vm.runInContext(identitySource,context);
const auditRepository=new context.SecurityAuditEventRepository_();
assert.equal(auditRepository.appendForContext({authoritative:true,tenantId:'TENANT-A',userId:'USER-A'},{id:'SAE-1',occurredAt:'2026-08-12T00:00:00Z'}).tenantId,'TENANT-A');
assert.equal(auditRepository.recentForContext({authoritative:true,tenantId:'TENANT-A',userId:'USER-A'},5).items.length,1);
vm.runInContext(fs.readFileSync(path.join(base,'Config.gs'),'utf8'),context);vm.runInContext(entitySource,context);context.getVmosConfig_=()=>({spreadsheetId:'fixture',mapping:context.VMOS_DEFAULT_MAPPING});
assert.equal(context.createRepository_('Job') instanceof context.SheetsPersistenceProvider_,true,'generic operational records select the configured provider rather than Sheets directly');
console.log('MOS-133B persistence provider contract, scoped tenant boundary, bounded reads, append behavior, and fail-closed selection tests passed');
