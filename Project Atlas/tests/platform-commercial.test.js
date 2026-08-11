const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),src=path.join(root,'appscript','src');
const context=vm.createContext({Date,Math,Number,String,Object,Array,JSON,VmosAuthorizationError_:function(message){this.message=message;}});
['ConfigCommercial.gs','Services/CommercialDomainService.gs','Services/NavigationService.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(src,file),'utf8'),context));
const platform={authoritative:true,userId:'P-1',capabilities:['PLATFORM_TENANT_READ']};
const service=new context.PlatformCommercialWorkspaceService_({
  tenants:{search:(query,limit)=>[{id:'T-1',displayName:'Example Shop',commercialState:'ACTIVE'}].slice(0,limit)},
  subscriptions:{findForTenant:()=>[{id:'S-1',planVersionId:'PV-1',state:'PAST_DUE',purchasedSeats:3,billingFrequency:'MONTHLY',nextBillingAt:'2026-09-01',paymentStatus:'FAILED',paymentMethodCategory:'CARD',updatedAt:'2026-08-11'}]},
  plans:{get:()=>({planKey:'ATLAS_TEAM',selfServiceSeatCap:10})},
  entitlements:{listForTenant:()=>[{type:'MODULE',key:'COATINGS',state:'ACTIVE'}]},
  seats:{summary:()=>({purchased:3,assigned:4,available:0,overage:1,planSeatCap:10})},
  audit:{recentForTenant:()=>[{eventType:'SEATS_CHANGED',occurredAt:'2026-08-10'}]}
});
const model=service.get(platform,'example',50);
assert.equal(model.scope,'PLATFORM'); assert.equal(model.items.length,1);
assert.deepEqual(model.items[0].attention,['PAST_DUE','OVER_ENTITLEMENT']);
assert.equal(model.items[0].paymentMethodCategory,'CARD');
assert.throws(()=>service.get({authoritative:true,tenantId:'T-1',capabilities:['ADMIN_CONFIG']},'',50),error=>/Platform/.test(error.message));
const nav=new context.AtlasNavigationService_({profile:{enabledModules:[]}});
assert.equal(nav.getModel(platform,'platform-commercial').groups.some(group=>group.items.some(item=>item.id==='platform-commercial')),true);
assert.equal(nav.getModel({capabilities:['ADMIN_CONFIG']},'admin').groups.some(group=>group.items.some(item=>item.id==='platform-commercial')),false);
assert.equal(context.atlasRouteTemplate_('platform-commercial'),'PlatformCommercial');
const html=fs.readFileSync(path.join(src,'UI','PlatformCommercial.html'),'utf8');
['Platform administration','Customer subscriptions','aria-live="polite"','@media(max-width:768px)','getPlatformCommercialWorkspace'].forEach(value=>assert(html.includes(value),value));
assert(!/card number|cvv|private key|api key/i.test(html));
console.log('Atlas platform-owner commercial workspace authority, bounded-model, responsive, and secret-safety tests passed');
