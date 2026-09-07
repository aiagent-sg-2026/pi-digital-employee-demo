import {beforeEach,describe,expect,it} from "vitest";
import {indexedDB,IDBKeyRange} from "fake-indexeddb";
import {en} from "../src/i18n/en";
import {zhCN} from "../src/i18n/zh-CN";
import {zhTW} from "../src/i18n/zh-TW";
import {formatDate,formatDateTime,formatMoney,formatTime,resolveSupportedLocale,setLocale,t,tFor} from "../src/i18n";
import {BUSINESS_DB_NAME,STORES,getRecord,initializeBusinessWorld,resetEntireDemo} from "../src/data/indexeddb";
Object.assign(globalThis,{indexedDB,IDBKeyRange});
class MemoryStorage{data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null}setItem(k:string,v:string){this.data.set(k,String(v))}removeItem(k:string){this.data.delete(k)}clear(){this.data.clear()}key(i:number){return [...this.data.keys()][i]??null}get length(){return this.data.size}}
const localStore=new MemoryStorage();Object.defineProperty(globalThis,"localStorage",{value:localStore,configurable:true});
const deleteDb=()=>new Promise<void>((resolve,reject)=>{const r=indexedDB.deleteDatabase(BUSINESS_DB_NAME);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);r.onblocked=()=>resolve();});
beforeEach(async()=>{localStore.clear();await deleteDb();await setLocale("en",{persist:false});});

describe("i18n registry",()=>{
  it("keeps en/zh-CN/zh-TW on the same key contract",()=>{expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort());const allowed=new Set(["common.alex","connections.erp","connections.gmail"]);expect(Object.keys(en).filter(key=>zhCN[key]===en[key]&&!allowed.has(key))).toEqual([]);expect(Object.keys(en).filter(key=>zhTW[key]===en[key]&&!allowed.has(key))).toEqual([]);});
  it("maps browser locale families deterministically",()=>{expect(resolveSupportedLocale("en-SG")).toBe("en");expect(resolveSupportedLocale("zh-CN")).toBe("zh-CN");expect(resolveSupportedLocale("zh-Hans-SG")).toBe("zh-CN");expect(resolveSupportedLocale("zh-TW")).toBe("zh-TW");expect(resolveSupportedLocale("zh-Hant-HK")).toBe("zh-TW");expect(resolveSupportedLocale("ms-SG")).toBeUndefined();});
  it("translates UI labels without translating business identity",()=>{expect(tFor("zh-CN","nav.home")).toBe("首页");expect(tFor("zh-TW","nav.home")).toBe("首頁");expect(tFor("zh-CN","common.alex")).toBe("Alex");expect(tFor("zh-TW","connections.erp")).toBe("Globe3 ERP");});
  it("uses one locale for money/date/date-time/time formatting",async()=>{await setLocale("zh-CN",{persist:false});expect(formatMoney(14520)).toContain("SGD");expect(formatDate("2025-03-01")).toContain("2025");expect(formatDateTime("2026-09-07T04:30:00Z")).toContain("2026");expect(formatTime("2026-09-07T04:30:00Z")).toMatch(/12[:：]30/);await setLocale("en",{persist:false});expect(t("nav.home")).toBe("Home");expect(formatDate("2025-03-01")).toContain("2025");});
  it("persists manual language choice in the normalized preferences store",async()=>{await setLocale("zh-TW");const pref=await getRecord<{id:string;value:string}>(STORES.preferences,"ui-language");expect(pref?.value).toBe("zh-TW");});
});


describe("i18n IndexedDB durability",()=>{
  it("upgrades the normalized v2 database to v3 preferences without losing task/business records",async()=>{
    const open=indexedDB.open(BUSINESS_DB_NAME,2);
    open.onupgradeneeded=()=>{const db=open.result;for(const name of Object.values(STORES).filter(name=>name!==STORES.preferences))db.createObjectStore(name,{keyPath:"id"});};
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error)});
    const tx=db.transaction([STORES.meta,STORES.customers,STORES.tasks],"readwrite");
    tx.objectStore(STORES.meta).put({id:"business-meta",schemaVersion:2,seedVersion:"demo-business-v1",snapshotDate:"2025-03-01",companyName:"Northstar Distribution Pte Ltd",seededAt:"2025-03-01T00:00:00Z"});
    tx.objectStore(STORES.customers).put({id:"customer-upgrade-proof",code:"C-UPGRADE",name:"Upgrade Proof Pte Ltd",aliases:[],currency:"SGD",creditLimit:1000,risk:"low",status:"active"});
    tx.objectStore(STORES.tasks).put({id:"task-upgrade-proof",title:"Upgrade proof",intent:"customer.lookup",status:"completed",createdAt:"2026-09-01T00:00:00Z",updatedAt:"2026-09-01T00:00:00Z"});
    await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close();
    await initializeBusinessWorld();
    expect((await getRecord<any>(STORES.customers,"customer-upgrade-proof"))?.name).toBe("Upgrade Proof Pte Ltd");
    expect((await getRecord<any>(STORES.tasks,"task-upgrade-proof"))?.status).toBe("completed");
    await setLocale("zh-CN");expect((await getRecord<any>(STORES.preferences,"ui-language"))?.value).toBe("zh-CN");
  });
  it("preserves manual language preference when the entire demo business world is reset",async()=>{await initializeBusinessWorld();await setLocale("zh-TW");await resetEntireDemo();expect((await getRecord<any>(STORES.preferences,"ui-language"))?.value).toBe("zh-TW");});
});
