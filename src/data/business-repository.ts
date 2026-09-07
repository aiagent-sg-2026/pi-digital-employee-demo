import { DEMO_SNAPSHOT_DATE } from "../demo/seed";
import { STORES, getAllByIndex, getAllRecords, getRecord, putRecord } from "./indexeddb";
import type { BusinessCreditNote, BusinessCustomer, BusinessException, BusinessFollowUpPolicy, BusinessInboxItem, BusinessInvoice, BusinessPayment, BusinessSnapshot } from "./models";

const norm=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
const taskNorm=(value:string)=>value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g," ").replace(/\s+/g," ").trim();
const phraseIn=(text:string,phrase:string)=>{const hay=` ${taskNorm(text)} `,needle=` ${taskNorm(phrase)} `;return needle.trim().length>0&&hay.includes(needle)};

export interface CustomerReferenceResolution {
  records: BusinessCustomer[];
  canonical: BusinessCustomer[];
  matchedTerms: string[];
  query?: string;
}

export function resolveCustomerReferences(customers:readonly BusinessCustomer[],text:string):CustomerReferenceResolution{
  const matched=new Map<string,{customer:BusinessCustomer;terms:string[]}>();
  for(const customer of customers){
    const terms=[customer.name,customer.code,...customer.aliases].filter(term=>phraseIn(text,term));
    if(terms.length)matched.set(customer.id,{customer,terms});
  }
  const records=[...matched.values()].map(value=>value.customer);
  const canonicalIds=new Set(records.map(customer=>customer.duplicateOf??customer.id));
  const canonical=customers.filter(customer=>canonicalIds.has(customer.id)&&!customer.duplicateOf);
  const matchedTerms=[...new Set([...matched.values()].flatMap(value=>value.terms))].sort((a,b)=>b.length-a.length);
  return{records,canonical,matchedTerms,query:matchedTerms[0]};
}

export interface BusinessRepository {
  findCustomer(query:string):Promise<{records:BusinessCustomer[];canonical:BusinessCustomer[]}>;
  resolveCustomerReference(text:string):Promise<CustomerReferenceResolution>;
  getCustomer(id:string):Promise<BusinessCustomer|undefined>;
  getInvoice(id:string):Promise<BusinessInvoice|undefined>;
  getPayment(id:string):Promise<BusinessPayment|undefined>;
  savePayment(payment:BusinessPayment):Promise<void>;
  listCustomers():Promise<BusinessCustomer[]>;
  listInvoicesByCustomer(customerId:string):Promise<BusinessInvoice[]>;
  listPaymentsByCustomer(customerId:string):Promise<BusinessPayment[]>;
  listCreditNotesByCustomer(customerId:string):Promise<BusinessCreditNote[]>;
  listPolicies():Promise<BusinessFollowUpPolicy[]>;
  listExceptions():Promise<BusinessException[]>;
  getBusinessSnapshot():Promise<BusinessSnapshot>;
}

export class IndexedDbBusinessRepository implements BusinessRepository {
  async findCustomer(query:string){const needle=norm(query);if(!needle)return{records:[],canonical:[]};const all=await getAllRecords<BusinessCustomer>(STORES.customers);const records=all.filter(c=>[c.code,c.name,...c.aliases].some(v=>norm(v).includes(needle)));const ids=new Set(records.map(c=>c.duplicateOf??c.id));const canonical=all.filter(c=>ids.has(c.id)&&!c.duplicateOf);return{records,canonical};}
  async resolveCustomerReference(text:string){return resolveCustomerReferences(await getAllRecords<BusinessCustomer>(STORES.customers),text)}
  getCustomer(id:string){return getRecord<BusinessCustomer>(STORES.customers,id)}
  getInvoice(id:string){return getRecord<BusinessInvoice>(STORES.invoices,id)}
  getPayment(id:string){return getRecord<BusinessPayment>(STORES.payments,id)}
  savePayment(payment:BusinessPayment){return putRecord(STORES.payments,payment)}
  async listCustomers(){return (await getAllRecords<BusinessCustomer>(STORES.customers)).filter(c=>!c.duplicateOf).sort((a,b)=>a.name.localeCompare(b.name));}
  async listInvoicesByCustomer(customerId:string){return (await getAllByIndex<BusinessInvoice>(STORES.invoices,"customerId",customerId)).filter(i=>!i.duplicateOf);}
  async listPaymentsByCustomer(customerId:string){return (await getAllByIndex<BusinessPayment>(STORES.payments,"customerId",customerId)).filter(p=>!p.duplicateOf);}
  listCreditNotesByCustomer(customerId:string){return getAllByIndex<BusinessCreditNote>(STORES.creditNotes,"customerId",customerId)}
  listPolicies(){return getAllRecords<BusinessFollowUpPolicy>(STORES.followUpPolicies)}
  async listExceptions(){const items=await getAllRecords<BusinessInboxItem>(STORES.inbox);return items.filter(i=>i.status!=="resolved").map(({id,messageKey,messageParams,type,severity,title,detail,relatedEntityType,relatedEntityId})=>({id,messageKey,messageParams,type,severity,title,detail,relatedEntityType,relatedEntityId}));}
  async getBusinessSnapshot(){
    const [customers,invoices,payments,credits,exceptions]=await Promise.all([this.listCustomers(),getAllRecords<BusinessInvoice>(STORES.invoices),getAllRecords<BusinessPayment>(STORES.payments),getAllRecords<BusinessCreditNote>(STORES.creditNotes),this.listExceptions()]);
    const canonicalInvoices=invoices.filter(i=>!i.duplicateOf&&i.status!=="paid"&&i.issuedOn<=DEMO_SNAPSHOT_DATE);
    let openReceivables=0,overdueInvoices=0;const atRisk=new Set<string>();
    for(const inv of canonicalInvoices){const paid=payments.filter(p=>!p.duplicateOf&&p.status==="matched"&&p.invoiceId===inv.id&&p.paidOn<=DEMO_SNAPSHOT_DATE).reduce((s,p)=>s+p.amount,0);const credit=credits.filter(c=>c.invoiceId===inv.id&&c.issuedOn<=DEMO_SNAPSHOT_DATE).reduce((s,c)=>s+c.amount,0);const out=Math.max(0,inv.amount-paid-credit);openReceivables+=out;if(out>0&&inv.dueOn<DEMO_SNAPSHOT_DATE){overdueInvoices++;const customer=customers.find(c=>c.id===inv.customerId);if(customer&&(customer.risk==="high"||out>customer.creditLimit*.6))atRisk.add(inv.customerId);}}
    return{snapshotDate:DEMO_SNAPSHOT_DATE,openReceivables,overdueInvoices,customersAtRisk:atRisk.size,exceptions:exceptions.length,customers:customers.length};
  }
}
