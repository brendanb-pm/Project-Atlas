const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.join(__dirname,'..','appscript','src');
const index=fs.readFileSync(path.join(root,'UI','Index.html'),'utf8');
const code=fs.readFileSync(path.join(root,'UI','Code.gs'),'utf8');
const navigation=fs.readFileSync(path.join(root,'Services','NavigationService.gs'),'utf8');
const workspace=fs.readFileSync(path.join(root,'Services','CommandCenterWorkspaceService.gs'),'utf8');
const serialization=fs.readFileSync(path.join(root,'Utilities','Serialization.gs'),'utf8');

function functionLine(source,name){const match=source.match(new RegExp('function '+name+'\\([^\\n]+'));assert(match,'missing '+name);return match[0];}

const client=vm.createContext({Array,Object});
vm.runInContext(functionLine(index,'validWorkspacePayload'),client);
vm.runInContext(functionLine(index,'workspaceResponse'),client);
const empty={generatedAt:'2026-08-11T12:00:00.000Z',accessState:'READY',attention:[],today:[],myWork:[],metrics:[],recent:{},unavailable:[]};
assert.equal(client.workspaceResponse({ok:true,data:empty}).ok,true,'valid empty workspace remains a success');
assert.equal(client.workspaceResponse({ok:true,data:{}}).ok,false,'malformed payload is not rendered as valid empty data');
assert.match(client.workspaceResponse({ok:false,error:{code:'AUTHORIZATION_ERROR',referenceId:'ERR-SAFE'}}).message,/identity and active membership.*ERR-SAFE/);
assert.match(client.workspaceResponse({ok:false,error:{code:'INTERNAL_ERROR',referenceId:'ERR-INTERNAL'}}).message,/could not be loaded.*ERR-INTERNAL/);

const endpointContext=vm.createContext({Date,Object,Array,String,Number,JSON,CommandCenterWorkspaceService_:function(){this.get=()=>({generatedAt:new Date('2026-08-11T12:00:00Z'),accessState:'READY',attention:[],today:[],myWork:[],metrics:[],recent:{},unavailable:[]});},callable_:(name,policy,operation)=>({ok:true,data:operation({capabilities:[]})})});
vm.runInContext(serialization,endpointContext);
vm.runInContext(functionLine(code,'getCommandCenterWorkspace'),endpointContext);
const endpointResult=endpointContext.getCommandCenterWorkspace();
assert.equal(typeof endpointResult.data.generatedAt,'string','Date is converted before google.script.run transport');
assert.equal(endpointResult.data.generatedAt,'2026-08-11T12:00:00.000Z');

const services=vm.createContext({Date,Object,Array,String,Number,JSON,getAtlasDeploymentProfile_:()=>({enabledModules:[]})});
vm.runInContext(navigation,services);
vm.runInContext(workspace,services);
const zero={userId:'USER-ZERO',tenantId:'TENANT-1',authoritative:true,capabilities:[]};
assert.equal(new services.AtlasNavigationService_().getModel(zero,'home').accessState,'LIMITED_ACCESS');
assert.equal(new services.CommandCenterWorkspaceService_({clock:()=>new Date('2026-08-11T12:00:00Z')}).get(zero).accessState,'NO_APPLICABLE_CAPABILITIES');
const admin={userId:'USER-ADMIN',tenantId:'TENANT-1',authoritative:true,capabilities:['CORE_RECORD_READ','FOLLOWUP_READ','OPERATIONS_READ','RFQ_READ','FINANCE_READ']};
assert.equal(new services.AtlasNavigationService_().getModel(admin,'home').accessState,'READY');
assert.equal(new services.CommandCenterWorkspaceService_({followUps:{list:()=>[]},jobs:{list:()=>[]},customers:{list:()=>[]},rfqs:{list:()=>[]},quotes:{list:()=>[]},invoices:{list:()=>[]},clock:()=>new Date('2026-08-11T12:00:00Z')}).get(admin).accessState,'READY');

console.log('Command Center live transport, payload classification, and navigation-context equivalence tests passed');
