import type { BusinessWorldIntent } from "../core/business-world-workflow";
import type { BusinessRepository } from "../data/business-repository";

export type TaskIntent = BusinessWorldIntent | "approval-demo" | "unsupported";
export interface RoutedTask { intent:TaskIntent; customerQuery?:string; resolvedCustomerId?:string; context:string; reason?:string; }
const SUPPORTED = "Supported demo capabilities: customer lookup, receivables review, payment reconciliation, follow-up preparation, exception review, overdue portfolio review, daily brief, and the local approval simulation.";

const normalizeTask=(value:string)=>value.normalize("NFKC").toLowerCase().replace(/[，。！？、,.!?;:]+/g," ").replace(/\s+/g," ").trim();
const matches=(text:string,patterns:readonly RegExp[])=>patterns.some(pattern=>pattern.test(text));

const lexicon={
  approval:[/demo approval/,/approval flow/,/requires approval/,/需要(?:经理|經理)?(?:审批|審批)/,/(?:审批|審批)(?:流程|演示|示範)/],
  brief:[/daily brief/,/today'?s brief/,/operations brief/,/今日(?:简报|簡報)/,/每日(?:简报|簡報)/,/(?:运营|營運)(?:简报|簡報)/],
  portfolio:[/who (?:needs|require).*follow/,/(?:who|which customers?) owe(?:s)? us the most/,/overdue customers/,/portfolio overdue/,/show overdue/,/highest priority accounts/,/逾期(?:客户|客戶)/,/(?:哪些|哪個|哪个)(?:客户|客戶).*(?:欠|未结|未結)/],
  exceptions:[/exception/,/(?:异常|異常)/],
  payments:[/unmatched payment/,/duplicate payment/,/reconcile payments?/,/payment reconciliation/,/未匹配付款/,/(?:重复|重複)付款/,/付款(?:对账|對帳)/],
  followup:[/follow[- ]?up/,/(?:跟进|跟進)/],
  ambiguous:[/resolve ambiguous customer/,/(?:客户|客戶)身份(?:歧义|歧義)/,/(?:歧义|歧義)(?:客户|客戶)/],
  lookup:[/find customer/,/lookup customer/,/customer lookup/,/(?:查找|查询|查詢)(?:客户|客戶)/,/(?:客户|客戶)(?:查找|查询|查詢)/],
  receivables:[/receivable/,/outstanding/,/invoice/,/account/,/(?:应收款|應收款)/,/(?:未结|未結)/,/(?:发票|發票)/,/(?:账户|帳戶)/],
} as const;

function extractCustomerSlot(text:string,intent:BusinessWorldIntent):string|undefined{
  const raw=text.normalize("NFKC").trim().replace(/[。.!?？]+$/g,"").trim();
  const patterns:RegExp[]=[];
  if(intent==="followup.prepare")patterns.push(/(?:prepare\s+)?(.+?)\s+(?:customer\s+)?follow[- ]?up\b/i,/(?:准备|準備)\s*(.+?)\s*(?:客户|客戶)?\s*(?:跟进|跟進)/);
  if(intent==="receivables.review")patterns.push(/(?:review|check)\s+(.+?)\s+(?:receivables?|outstanding(?:\s+invoices?)?|invoices?|account)\b/i,/(?:检查|檢查|查看)\s*(.+?)\s*(?:应收款|應收款|未结|未結|发票|發票|账户|帳戶)/);
  if(intent==="customer.lookup")patterns.push(/(?:find|lookup)\s+(?:customer\s+)?(.+?)(?:\s+customer)?$/i,/(?:查找|查询|查詢)\s*(?:客户|客戶)?\s*(.+)$/);
  for(const pattern of patterns){const match=raw.match(pattern);const value=match?.[1]?.trim();if(value)return value;}
  return undefined;
}

function detectIntent(text:string):TaskIntent{
  if(matches(text,lexicon.approval))return"approval-demo";
  if(matches(text,lexicon.brief))return"daily.brief";
  if(matches(text,lexicon.portfolio))return"portfolio.overdue";
  if(matches(text,lexicon.exceptions))return"exceptions.review";
  if(matches(text,lexicon.payments))return"payments.reconcile";
  if(matches(text,lexicon.ambiguous))return"receivables.review";
  if(matches(text,lexicon.followup))return"followup.prepare";
  if(matches(text,lexicon.lookup))return"customer.lookup";
  if(matches(text,lexicon.receivables))return"receivables.review";
  return"unsupported";
}

async function customerRoute(task:string,intent:BusinessWorldIntent,business:Pick<BusinessRepository,"resolveCustomerReference">):Promise<RoutedTask>{
  const normalized=normalizeTask(task);
  if(matches(normalized,lexicon.ambiguous))return{intent,customerQuery:"Twin",context:"Twin customer clarification"};
  const resolution=await business.resolveCustomerReference(task);
  if(resolution.canonical.length===1){const customer=resolution.canonical[0]!;const query=resolution.query??customer.code;return{intent,customerQuery:query,resolvedCustomerId:customer.id,context:`${customer.name} account`};}
  if(resolution.canonical.length>1){const query=resolution.query??extractCustomerSlot(task,intent)??"Customer";return{intent,customerQuery:query,context:`${query} customer clarification`};}
  const query=extractCustomerSlot(task,intent);
  if(query)return{intent,customerQuery:query,context:`${query} account`};
  return{intent:"unsupported",context:"Customer required",reason:`A customer name/code is required. ${SUPPORTED}`};
}

export async function routeDashboardTask(task:string,business:Pick<BusinessRepository,"resolveCustomerReference">):Promise<RoutedTask>{
  const text=task.trim();const normalized=normalizeTask(text);
  if(!text)return{intent:"unsupported",context:"No task",reason:"Enter a task first."};
  const intent=detectIntent(normalized);
  if(intent==="unsupported")return{intent,context:"Unsupported demo capability",reason:SUPPORTED};
  if(intent==="approval-demo"){
    const resolution=await business.resolveCustomerReference(text);
    const customer=resolution.canonical.length===1?(resolution.query??resolution.canonical[0]!.code):normalized.includes("bright")?"Bright Star":normalized.includes("riverside")?"Riverside":"ACME";
    return{intent,customerQuery:customer,resolvedCustomerId:resolution.canonical.length===1?resolution.canonical[0]!.id:undefined,context:"Local Demo Simulation"};
  }
  if(intent==="daily.brief"||intent==="portfolio.overdue"||intent==="exceptions.review"||intent==="payments.reconcile")return{intent,context:intent==="daily.brief"||intent==="portfolio.overdue"?"Northstar Distribution portfolio":intent==="exceptions.review"?"Business exception queue":"Payment reconciliation queue"};
  return customerRoute(text,intent,business);
}
