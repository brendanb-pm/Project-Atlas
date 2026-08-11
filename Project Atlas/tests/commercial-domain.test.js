const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const context=vm.createContext({Date,Math,Number,String,Object,Array,JSON,VmosAuthorizationError_:function(message){this.message=message;},VmosValidationError_:function(message){this.message=message;}});
['ConfigCommercial.gs','Services/CommercialDomainService.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context));
const rows=value=>({list:()=>value});
const subscriptions=[{id:'S-1',tenantId:'T-1',planVersionId:'PV-1',state:'ACTIVE',purchasedSeats:2}];
const entitlements=[{id:'E-CORE',tenantId:'T-1',subscriptionId:'S-1',type:'PRODUCT',key:'ATLAS_CORE',state:'ACTIVE'}];
const entitlement=new context.CommercialEntitlementService_({subscriptions:{findForTenant:()=>subscriptions},entitlements:{listForTenant:()=>entitlements}});
assert.equal(entitlement.decision({tenantId:'T-1',entitlementKey:'ATLAS_CORE'}).allowed,true);
assert.throws(()=>entitlement.assertAllowed({tenantId:'T-1',entitlementKey:'COATINGS'}),error=>/unavailable/.test(error.message));

const seatDependencies={memberships:rows([{tenantId:'T-1',userId:'U-1',status:'ACTIVE'},{tenantId:'T-1',userId:'U-2',status:'ACTIVE'},{tenantId:'T-1',userId:'SYS',status:'ACTIVE'},{tenantId:'T-1',userId:'KIOSK',status:'ACTIVE'}]),users:rows([{id:'U-1',status:'ACTIVE',identityType:'HUMAN'},{id:'U-2',status:'INACTIVE',identityType:'HUMAN'},{id:'SYS',status:'ACTIVE',identityType:'SYSTEM'},{id:'KIOSK',status:'ACTIVE',identityType:'KIOSK'}]),assignments:{listForTenant:()=>[{userId:'U-1',state:'ACTIVE'},{userId:'U-2',state:'ACTIVE'},{userId:'SYS',state:'ACTIVE'},{userId:'KIOSK',state:'ACTIVE'}]},subscriptions:{findForTenant:()=>subscriptions},plans:{get:()=>({selfServiceSeatCap:5})}};
const seats=new context.SeatMeteringService_(seatDependencies).summary('T-1');
assert.deepEqual({purchased:seats.purchased,assigned:seats.assigned,billable:seats.billable,available:seats.available,overage:seats.overage,cap:seats.planSeatCap},{purchased:2,assigned:1,billable:1,available:1,overage:0,cap:5});

const tenants=[],audits=[];
const tenantRepo={list:()=>tenants,search:(query,limit)=>tenants.slice(0,limit),create:record=>(tenants.push(record),record),get:id=>tenants.find(row=>row.id===id)};
const auditRepo={findByCommand:(tenant,command)=>audits.find(row=>row.tenantId===tenant&&row.commandId===command),create:record=>(audits.push(record),record)};
const service=new context.CommercialDomainService_({tenants:tenantRepo,plans:{},subscriptions:{},entitlements:{},audit:auditRepo,clock:()=>new Date('2026-08-11T12:00:00Z'),uuid:(()=>{let n=0;return()=>String(++n);})()});
const platform={authoritative:true,actorType:'USER',userId:'P-1',correlationId:'C-1',capabilities:['PLATFORM_TENANT_READ','PLATFORM_TENANT_MANAGE']};
const created=service.createTenant({id:'T-NEW',displayName:'Example Tenant'},platform,'CMD-1');
assert.equal(created.commercialState,'TRIAL');
assert.equal(service.createTenant({id:'T-NEW',displayName:'Example Tenant'},platform,'CMD-1').id,created.id);
assert.equal(tenants.length,1); assert.equal(audits[0].actorId,'P-1');
assert.equal(service.listTenants('',50,platform).length,1);
assert.throws(()=>service.createTenant({id:'T-BAD',displayName:'Bad'},{authoritative:true,actorType:'USER',capabilities:['ADMIN_CONFIG']},'CMD-2'),error=>/Platform/.test(error.message));
assert.throws(()=>service.listTenants('',50,{authoritative:true,tenantId:'T-1',capabilities:['ADMIN_CONFIG']}),error=>/Platform/.test(error.message));

const tenantAdmin={authoritative:true,tenantId:'T-1',userId:'A-1',capabilities:['ADMIN_CONFIG']};
const preview=service.previewSeatChange('T-1',3,tenantAdmin,seatDependencies);
assert.equal(preview.allowed,true); assert.equal(preview.monetaryImpact,'PROVIDER_QUOTE_REQUIRED');
assert.equal(service.previewSeatChange('T-1',0,tenantAdmin,seatDependencies).allowed,false);
assert.equal(service.previewSeatChange('T-1',6,tenantAdmin,seatDependencies).allowed,false);
assert.throws(()=>service.previewSeatChange('T-2',3,tenantAdmin,seatDependencies),error=>/Tenant/.test(error.message));
assert.equal(context.ATLAS_COMMERCIAL_MAPPINGS.Invitation.sheetName,'AtlasTenantInvitations');
assert.equal(context.ATLAS_COMMERCIAL_MAPPINGS.InvoiceSnapshot.sheetName,'AtlasInvoiceSnapshots');
assert.equal(context.ATLAS_COMMERCIAL_STATES.includes('PAYMENT_FAILED'),true);
console.log('Atlas commercial tenant, subscription, entitlement, seat, audit, and authority-boundary tests passed');
