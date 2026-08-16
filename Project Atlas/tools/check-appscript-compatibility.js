'use strict';

const fs=require('fs'),path=require('path'),vm=require('vm');
const productionRoot=path.join(__dirname,'..','appscript','src');

function sourceFiles(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>{const target=path.join(root,entry.name);return entry.isDirectory()?sourceFiles(target):(entry.isFile()&&/\.(?:gs|html)$/.test(entry.name)?[target]:[]);});}
function serverFiles(root){return sourceFiles(root).filter(file=>file.endsWith('.gs'));}
function unsupported(source,file){const checks=[
  ['BigInt constructor',/\bBigInt\s*\(/g],
  ['BigInt literal',/\b(?:\d[\d_]*|0[xob][0-9a-f_]+)n\b/gi],
  ['ECMAScript module syntax',/^\s*(?:import|export)\b/gm],
  ['Node CommonJS/runtime API',/\b(?:require\s*\(|module\.exports\b|process\.|Buffer\.|__dirname\b|__filename\b)/g]
];const findings=[];checks.forEach(([label,pattern])=>{let match;while((match=pattern.exec(source))!==null)findings.push({file,label,index:match.index,token:match[0]});});return findings;}
function check(root=productionRoot){const findings=[];serverFiles(root).forEach(file=>{const source=fs.readFileSync(file,'utf8');findings.push(...unsupported(source,file));try{new vm.Script(source,{filename:file});}catch(error){findings.push({file,label:'JavaScript parse error',index:0,token:error.message});}});return findings;}

if(require.main===module){const findings=check();if(findings.length){findings.forEach(item=>console.error(`${path.relative(productionRoot,item.file)}: ${item.label}: ${item.token}`));process.exitCode=1;}else console.log(`Apps Script compatibility gate passed (${serverFiles(productionRoot).length} server files parsed and checked; ${sourceFiles(productionRoot).length} production files inventoried).`);}
module.exports={check,unsupported,productionRoot};
