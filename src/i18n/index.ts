import { en } from "./en";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";
import { STORES, getRecord, putRecord } from "../data/indexeddb";

export type SupportedLocale = "en"|"zh-CN"|"zh-TW";
const dictionaries:Record<SupportedLocale,Record<string,string>>={en,"zh-CN":zhCN,"zh-TW":zhTW};
const listeners=new Set<(locale:SupportedLocale)=>void>();
const textKeys=new WeakMap<Text,string>();
const attrKeys=new WeakMap<Element,Map<string,string>>();
const reverseEnglish=new Map<string,string>();
for(const [key,value] of Object.entries(en))if(!reverseEnglish.has(value))reverseEnglish.set(value,key);
let locale:SupportedLocale="en";

export function resolveSupportedLocale(value:string|undefined):SupportedLocale|undefined{
  if(!value)return undefined;const lower=value.toLowerCase();
  if(lower==="zh-cn"||lower.startsWith("zh-hans")||lower==="zh-sg")return "zh-CN";
  if(lower==="zh-tw"||lower==="zh-hk"||lower==="zh-mo"||lower.startsWith("zh-hant"))return "zh-TW";
  if(lower==="en"||lower.startsWith("en-"))return "en";
  return undefined;
}
function detectBrowserLocale():SupportedLocale{for(const value of navigator.languages??[navigator.language]){const matched=resolveSupportedLocale(value);if(matched)return matched;}return "en";}
export function getLocale(){return locale;}
export function localeLanguageName(value:SupportedLocale){return value==="zh-CN"?"Simplified Chinese":value==="zh-TW"?"Traditional Chinese":"English";}
export function t(key:string,params:Record<string,string|number>={}):string{let value=dictionaries[locale][key]??en[key]??key;for(const [name,replacement] of Object.entries(params))value=value.replaceAll(`{${name}}`,String(replacement));return value;}
export function tFor(target:SupportedLocale,key:string,params:Record<string,string|number>={}):string{let value=dictionaries[target][key]??en[key]??key;for(const [name,replacement] of Object.entries(params))value=value.replaceAll(`{${name}}`,String(replacement));return value;}
export function onLocaleChange(listener:(locale:SupportedLocale)=>void){listeners.add(listener);return()=>listeners.delete(listener);}
export async function setLocale(next:SupportedLocale,{persist=true}={}){locale=next;if(typeof document!=="undefined"){document.documentElement.lang=next;applyDomTranslations();}if(persist)await putRecord(STORES.preferences,{id:"ui-language",value:next,updatedAt:new Date().toISOString()});listeners.forEach(listener=>listener(locale));}
export async function bootstrapI18n(){const saved=await getRecord<{id:string;value?:string}>(STORES.preferences,"ui-language");locale=resolveSupportedLocale(saved?.value)??detectBrowserLocale();document.documentElement.lang=locale;applyDomTranslations();return locale;}

function preserveWhitespace(original:string,replacement:string){const leading=original.match(/^\s*/)?.[0]??"",trailing=original.match(/\s*$/)?.[0]??"";return`${leading}${replacement}${trailing}`;}
export function applyDomTranslations(root?:ParentNode){
  if(typeof document==="undefined")return;root??=document;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node=walker.nextNode() as Text|null;
  while(node){const trimmed=node.data.trim();let key=textKeys.get(node);if(!key&&trimmed)key=reverseEnglish.get(trimmed);if(key){textKeys.set(node,key);node.data=preserveWhitespace(node.data,t(key));}node=walker.nextNode() as Text|null;}
  const attrs=["placeholder","aria-label","title"];
  const elements=(root instanceof Element?[root,...root.querySelectorAll("*")]:[...root.querySelectorAll("*")]) as Element[];
  for(const element of elements){let bindings=attrKeys.get(element);if(!bindings){bindings=new Map();attrKeys.set(element,bindings);}for(const attr of attrs){const current=element.getAttribute(attr);if(!current)continue;let key=bindings.get(attr);if(!key)key=reverseEnglish.get(current);if(key){bindings.set(attr,key);element.setAttribute(attr,t(key));}}}
}
const intlLocale=()=>locale==="en"?"en-SG":locale;
export function formatMoney(value:number,currency="SGD"){return new Intl.NumberFormat(intlLocale(),{style:"currency",currency,currencyDisplay:"code",minimumFractionDigits:0,maximumFractionDigits:2}).format(value);}
export function formatDate(value:string|Date){const date=value instanceof Date?value:new Date(value.includes("T")?value:`${value}T00:00:00+08:00`);return new Intl.DateTimeFormat(intlLocale(),{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Singapore"}).format(date);}
export function formatDateTime(value:string|Date){return new Intl.DateTimeFormat(intlLocale(),{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Singapore"}).format(value instanceof Date?value:new Date(value));}
export function formatTime(value:string|Date){return new Intl.DateTimeFormat(intlLocale(),{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Singapore"}).format(value instanceof Date?value:new Date(value));}
