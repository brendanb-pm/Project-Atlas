function createFirearmsRepository_(name,key){var c=getFirearmsConfig_();return new SheetsRepository_(name,c.mappings[key],SpreadsheetApp.openById(c.spreadsheetId));}
function SerializedFirearmRepository_(){this.repository=createFirearmsRepository_('SerializedFirearm','firearms');}
SerializedFirearmRepository_.prototype.list=function(){return this.repository.list();};
SerializedFirearmRepository_.prototype.get=function(id){return this.repository.findById(id);};
SerializedFirearmRepository_.prototype.create=function(r){return this.repository.insertUnique?this.repository.insertUnique(r):this.repository.insert(r);};
SerializedFirearmRepository_.prototype.update=function(id,c){return this.repository.updateById(id,c);};
SerializedFirearmRepository_.prototype.findDuplicate=function(tenantId,manufacturer,importer,serial){return this.list().filter(function(r){return String(r.tenantId)===String(tenantId)&&String(r.manufacturer||'').toUpperCase()===String(manufacturer||'').toUpperCase()&&String(r.importer||'').toUpperCase()===String(importer||'').toUpperCase()&&String(r.serialNormalized)===String(serial);})[0];};
function FirearmRegulatoryEventRepository_(){this.repository=createFirearmsRepository_('FirearmRegulatoryEvent','events');}
FirearmRegulatoryEventRepository_.prototype.list=function(){return this.repository.list();};
FirearmRegulatoryEventRepository_.prototype.get=function(id){return this.repository.findById(id);};
FirearmRegulatoryEventRepository_.prototype.append=function(e){return this.repository.insertUnique?this.repository.insertUnique(e):this.repository.insert(e);};
FirearmRegulatoryEventRepository_.prototype.listByFirearm=function(tenantId,id){return this.list().filter(function(e){return String(e.tenantId)===String(tenantId)&&String(e.firearmId)===String(id);});};
function ExternalFflRepository_(){this.repository=createFirearmsRepository_('ExternalFFL','ffls');}
ExternalFflRepository_.prototype.list=function(){return this.repository.list();};
ExternalFflRepository_.prototype.get=function(id){return this.repository.findById(id);};
