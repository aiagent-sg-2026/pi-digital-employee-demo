import type { BusinessWorldIntent } from "../core/business-world-workflow";

export type TaskIntent = BusinessWorldIntent | "approval-demo" | "unsupported";
export interface RoutedTask { intent:TaskIntent; customerQuery?:string; context:string; reason?:string; }
const SUPPORTED = "Supported demo capabilities: customer lookup, receivables review, payment reconciliation, follow-up preparation, exception review, overdue portfolio review, daily brief, and the local approval simulation.";

function customerFrom(text:string):string|undefined{
  const cleaned=text.replace(/\b(review|check|find|show|prepare|investigate|please|customer|account|receivables?|outstanding|invoices?|payments?|follow[- ]?up|overdue|due|actions?|based|verified|and|for|the|a|an|record|status)\b/gi," ").replace(/[^a-z0-9&-]+/gi," ").replace(/\s+/g," ").trim();
  return cleaned || undefined;
}
export function routeDashboardTask(task:string):RoutedTask{
  const text=task.trim();const lower=text.toLowerCase();
  if(!text)return{intent:"unsupported",context:"No task",reason:"Enter a task first."};
  if(lower.includes("demo approval")||lower.includes("approval flow")||lower.includes("requires approval")){const customer=lower.includes("bright")?"Bright Star":lower.includes("riverside")?"Riverside":"ACME";return{intent:"approval-demo",customerQuery:customer,context:"Local Demo Simulation"};}
  if(/daily brief|today'?s brief|operations brief/.test(lower))return{intent:"daily.brief",context:"Northstar Distribution portfolio"};
  if(/who (needs|require).*follow|(?:who|which customers?) owe(?:s)? us the most|overdue customers|portfolio overdue|show overdue|highest priority accounts/.test(lower))return{intent:"portfolio.overdue",context:"Northstar Distribution portfolio"};
  if(/exception/.test(lower))return{intent:"exceptions.review",context:"Business exception queue"};
  if(/unmatched payment|duplicate payment|reconcile payments|payment reconciliation/.test(lower))return{intent:"payments.reconcile",context:"Payment reconciliation queue"};
  if(/follow[- ]?up/.test(lower)){const query=customerFrom(text);return{intent:"followup.prepare",customerQuery:query,context:query?`${query} account`:"Customer follow-up"};}
  if(/find customer|lookup customer|customer lookup|resolve ambiguous customer/.test(lower)){const query=/ambiguous/.test(lower)?"Twin":customerFrom(text);return{intent:"customer.lookup",customerQuery:query,context:query?`${query} customer lookup`:"Customer lookup"};}
  if(/receivable|outstanding|invoice|account/.test(lower)){const query=customerFrom(text);return query?{intent:"receivables.review",customerQuery:query,context:`${query} account`}:{intent:"unsupported",context:"Customer required",reason:`A customer name/code is required. ${SUPPORTED}`};}
  return{intent:"unsupported",context:"Unsupported demo capability",reason:SUPPORTED};
}
