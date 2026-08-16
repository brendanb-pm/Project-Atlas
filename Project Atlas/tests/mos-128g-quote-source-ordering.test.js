const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','appscript','src','UI','QuoteBuilder.html'),'utf8');
const start=html.indexOf('function sourcePickerError('),end=html.indexOf('function relationshipChanged(');
assert(start>0&&end>start,'Quote source picker functions are present');
const elements={};
function element(id){return elements[id]||(elements[id]={id,value:'',hidden:false,attrs:{},html:'',setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},getAttribute(k){return this.attrs[k];},querySelectorAll(){return [];},set innerHTML(v){this.html=v;},get innerHTML(){return this.html;}});}
element('sourceRelationship').value='VENDOR';
const requests={documents:[],targets:[]},runner={success:null,failure:null,withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},searchQuoteSourceDocuments(query){requests.documents.push({query,success:this.success,failure:this.failure});return this;},searchQuoteSourceTargets(type,query,quoteId){requests.targets.push({type,query,quoteId,success:this.success,failure:this.failure});return this;}};
const context=vm.createContext({document:{getElementById:element},google:{script:{run:runner}},AtlasUi:{sessionExpired:()=>false,announce:()=>{}},state:{quote:{id:'Q-1'},selectedDocument:null,selectedSourceTarget:null},timers:{},clearTimeout:()=>{},setTimeout:fn=>(fn(),1),esc:value=>String(value==null?'':value)});
vm.runInContext(html.slice(start,end),context);
const ok=label=>({ok:true,data:{items:[{id:label,label,secondary:label+' result'}]}});

function reset(kind,inputId,resultId){requests[kind].length=0;const input=element(inputId),result=element(resultId);input.attrs={};result.html='';return {input,result};}

// Source A/B: B succeeds first; late A success and failure cannot replace B or own B's busy state.
let ui=reset('documents','sourceSearch','sourceResults');ui.input.value='A';context.sourceSearch();ui.input.value='B';context.sourceSearch();assert.equal(ui.input.getAttribute('aria-busy'),'true');requests.documents[0].success(ok('A'));assert.equal(ui.input.getAttribute('aria-busy'),'true');requests.documents[1].success(ok('B'));assert.match(ui.result.html,/>B</);assert.equal(ui.input.getAttribute('aria-busy'),undefined);requests.documents[0].failure(new Error('late A'));assert.match(ui.result.html,/>B</);

// Source rapid A/B/C out of order: only C is authoritative.
ui=reset('documents','sourceSearch','sourceResults');['A','B','C'].forEach(q=>{ui.input.value=q;context.sourceSearch();});requests.documents[2].success(ok('C'));requests.documents[0].success(ok('A'));requests.documents[1].success(ok('B'));assert.match(ui.result.html,/>C</);assert.doesNotMatch(ui.result.html,/>A</);assert.doesNotMatch(ui.result.html,/>B</);

// Target A/B: stale success and stale failure are ignored and active completion owns busy cleanup.
ui=reset('targets','sourceTargetSearch','sourceTargetResults');ui.input.value='A';context.sourceTargetSearch();ui.input.value='B';context.sourceTargetSearch();requests.targets[0].success(ok('A'));assert.equal(ui.input.getAttribute('aria-busy'),'true');requests.targets[1].success(ok('B'));assert.match(ui.result.html,/>B</);requests.targets[0].failure(new Error('late A'));assert.match(ui.result.html,/>B</);assert.equal(ui.input.getAttribute('aria-busy'),undefined);

// Target rapid A/B/C out of order.
ui=reset('targets','sourceTargetSearch','sourceTargetResults');['A','B','C'].forEach(q=>{ui.input.value=q;context.sourceTargetSearch();});requests.targets[2].success(ok('C'));requests.targets[1].failure(new Error('late B'));requests.targets[0].success(ok('A'));assert.match(ui.result.html,/>C</);

// An active target failure is terminal for that generation and clears its own busy state.
ui=reset('targets','sourceTargetSearch','sourceTargetResults');ui.input.value='FAIL';context.sourceTargetSearch();requests.targets[0].failure(new Error('active target failure'));assert.equal(ui.input.getAttribute('aria-busy'),undefined);

// Independent domains: starting a newer source request does not invalidate a valid target response.
reset('documents','sourceSearch','sourceResults');reset('targets','sourceTargetSearch','sourceTargetResults');element('sourceSearch').value='DOC-A';context.sourceSearch();element('sourceTargetSearch').value='TARGET-X';context.sourceTargetSearch();element('sourceSearch').value='DOC-B';context.sourceSearch();requests.targets[0].success(ok('TARGET-X'));assert.match(element('sourceTargetResults').html,/>TARGET-X</);assert.equal(element('sourceTargetSearch').getAttribute('aria-busy'),undefined);assert.equal(element('sourceSearch').getAttribute('aria-busy'),'true');requests.documents[1].failure(new Error('active source failure'));assert.equal(element('sourceSearch').getAttribute('aria-busy'),undefined);assert.match(element('sourceTargetResults').html,/>TARGET-X</);

console.log('MOS-128G Quote source and target async ordering tests passed');
