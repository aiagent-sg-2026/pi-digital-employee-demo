import type { BusinessException, BusinessInboxItem, InboxType, IssueMessageParams } from "../data/models";
import { formatMoneyFor, getLocale, tFor, type SupportedLocale } from "../i18n";

type PresentableIssue = Pick<BusinessInboxItem,"type"|"issueKey"|"title"|"detail"|"messageKey"|"messageParams"|"resolution"|"resolutionKey"|"resolutionParams"> | BusinessException;

const defaultKeys:Record<InboxType,string>={
  "unmatched-payment":"issue.unmatchedPayment",
  "duplicate-payment":"issue.duplicatePayment",
  "invoice-dispute":"issue.invoiceDispute",
  "credit-limit":"issue.creditLimit",
  "ambiguous-customer":"issue.ambiguousCustomer",
  "approval-required":"issue.approvalRequired",
};

function paramsFor(locale:SupportedLocale,params:IssueMessageParams|undefined):Record<string,string|number>{
  const output:{[key:string]:string|number}={...(params??{})};
  const currency=typeof output.currency==="string"?output.currency:"SGD";
  for(const key of ["amount","limit"]){if(typeof output[key]==="number")output[key]=formatMoneyFor(locale,output[key] as number,currency);}
  return output;
}

function inferredKey(issue:PresentableIssue):string{
  if(issue.messageKey)return issue.messageKey;
  if(issue.type==="ambiguous-customer"&&"issueKey" in issue&&issue.issueKey?.startsWith("customer-not-found:"))return"issue.customerNotFound";
  return defaultKeys[issue.type];
}

export function presentInboxIssue(issue:PresentableIssue,locale:SupportedLocale=getLocale()):{title:string;detail:string;resolution?:string}{
  const key=inferredKey(issue),params=paramsFor(locale,issue.messageParams);
  const title=tFor(locale,`${key}.title`,params),detail=tFor(locale,`${key}.detail`,params);
  const unresolved=(value:string)=>value.includes("{")&&value.includes("}");
  const localizedTitle=title===`${key}.title`||unresolved(title)?issue.title:title;
  const localizedDetail=detail===`${key}.detail`||unresolved(detail)?issue.detail:detail;
  let resolution:string|undefined;
  if("resolutionKey" in issue&&issue.resolutionKey){const resolutionParams=paramsFor(locale,issue.resolutionParams);const translated=tFor(locale,issue.resolutionKey,resolutionParams);resolution=translated===issue.resolutionKey?issue.resolution:translated;}
  else if("resolution" in issue)resolution=issue.resolution;
  return{title:localizedTitle,detail:localizedDetail,resolution};
}
