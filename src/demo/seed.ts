import type {
  BusinessCreditNote, BusinessCustomer, BusinessFollowUpPolicy, BusinessInboxItem,
  BusinessInvoice, BusinessPayment, DemoMeta,
} from "../data/models";

export const BUSINESS_SCHEMA_VERSION = 2;
export const DEMO_SEED_VERSION = "demo-business-v1";
export const DEMO_SNAPSHOT_DATE = "2025-03-01";
export const DEMO_COMPANY_NAME = "Northstar Distribution Pte Ltd";

const customers: BusinessCustomer[] = [
  ["acme","C-1000","ACME Trading Pte Ltd",["ACME","ACME Trading"],65000,"medium"],
  ["beacon","C-1001","Beacon Retail Pte Ltd",["Beacon","Beacon Retail"],50000,"low"],
  ["brightstar","C-1002","Bright Star Engineering Pte Ltd",["Bright Star"],40000,"high"],
  ["delta","C-1003","Delta Point Logistics Pte Ltd",["Delta Point","Delta"],75000,"medium"],
  ["evergreen","C-1004","Evergreen Medical Supplies Pte Ltd",["Evergreen"],90000,"low"],
  ["harbour","C-1005","Harbour Foods Pte Ltd",["Harbour Foods"],45000,"medium"],
  ["lioncity","C-1006","Lion City Components Pte Ltd",["Lion City"],60000,"low"],
  ["meridian","C-1007","Meridian Office Systems Pte Ltd",["Meridian"],35000,"medium"],
  ["nova","C-1008","Nova Labs Pte Ltd",["Nova"],55000,"high"],
  ["orchid","C-1009","Orchid Hospitality Pte Ltd",["Orchid"],70000,"low"],
  ["pacific","C-1010","Pacific Crest Marine Pte Ltd",["Pacific Crest"],80000,"medium"],
  ["quantum","C-1011","Quantum Automation Pte Ltd",["Quantum"],100000,"low"],
  ["riverside","C-1012","Riverside Services Pte Ltd",["Riverside"],45000,"medium"],
  ["summit","C-1013","Summit Tech Pte Ltd",["Summit"],85000,"low"],
  ["vertex","C-1014","Vertex Manufacturing Pte Ltd",["Vertex"],60000,"high"],
].map(([slug, code, name, aliases, creditLimit, risk]) => ({
  id:`customer-${slug}`, code:String(code), name:String(name), aliases:aliases as string[], currency:"SGD", creditLimit:Number(creditLimit), risk:risk as BusinessCustomer["risk"], status:"active",
}));
customers.push({ id:"customer-beacon-legacy", code:"LEGACY-B01", name:"Beacon Trading Pte Ltd", aliases:["Beacon"], currency:"SGD", creditLimit:50000, risk:"medium", status:"active", duplicateOf:"customer-beacon" });
customers.push({ id:"customer-twin-north", code:"C-1090", name:"Twin North Trading Pte Ltd", aliases:["Twin"], currency:"SGD", creditLimit:30000, risk:"medium", status:"active" });
customers.push({ id:"customer-twin-south", code:"C-1091", name:"Twin South Trading Pte Ltd", aliases:["Twin"], currency:"SGD", creditLimit:30000, risk:"medium", status:"active" });

const invoices: BusinessInvoice[] = [];
const payments: BusinessPayment[] = [];
const creditNotes: BusinessCreditNote[] = [];
const day = (n:number) => `2025-02-${String(Math.max(1, Math.min(28,n))).padStart(2,"0")}`;
const customerBySlug = (slug:string) => `customer-${slug}`;

const addInvoice = (customerId:string, suffix:string, amount:number, dueOn:string, status:BusinessInvoice["status"]="open", issuedOn="2025-01-10") => {
  const id=`invoice-${customerId.replace("customer-","")}-${suffix}`;
  invoices.push({id,customerId,number:`INV-${suffix.toUpperCase()}`,issuedOn,dueOn,amount,currency:"SGD",status});
  return id;
};
const addPayment = (customerId:string|undefined, invoiceId:string|undefined, suffix:string, amount:number, status:BusinessPayment["status"]="matched") => {
  payments.push({id:`payment-${suffix}`,customerId,invoiceId,reference:`PAY-${suffix.toUpperCase()}`,paidOn:"2025-02-20",amount,currency:"SGD",status});
};

const acmePaid=addInvoice(customerBySlug("acme"),"acme-100",4500,"2024-12-31","paid","2024-12-01"); addPayment(customerBySlug("acme"),acmePaid,"acme-100",4500);
const acmePartial=addInvoice(customerBySlug("acme"),"acme-101",7000,"2025-01-15"); addPayment(customerBySlug("acme"),acmePartial,"acme-101",2000);
const acmeCredit=addInvoice(customerBySlug("acme"),"acme-102",8000,"2025-02-15"); creditNotes.push({id:"credit-acme-102",customerId:customerBySlug("acme"),invoiceId:acmeCredit,number:"CN-ACME-102",issuedOn:"2025-02-20",amount:1480,currency:"SGD"});
addInvoice(customerBySlug("acme"),"acme-103",3000,"2025-03-10");
invoices.push({...invoices.at(-1)!,id:"invoice-acme-103-duplicate",duplicateOf:invoices.at(-1)!.id});
payments.push({...payments.find(p=>p.id==="payment-acme-101")!,id:"payment-acme-101-duplicate",duplicateOf:"payment-acme-101"});

const beacon1=addInvoice(customerBySlug("beacon"),"beacon-201",12000,"2025-01-10"); addPayment(customerBySlug("beacon"),beacon1,"beacon-201",4000);
addInvoice(customerBySlug("beacon"),"beacon-202",6500,"2025-03-08");
const bright=addInvoice(customerBySlug("brightstar"),"bright-301",48000,"2025-01-05"); addPayment(customerBySlug("brightstar"),bright,"bright-301",5000);
addInvoice(customerBySlug("riverside"),"river-401",9500,"2025-01-20","disputed");

const paidSlugs=["evergreen","lioncity","orchid","quantum","summit"];
for (const [index,slug] of paidSlugs.entries()) { const inv=addInvoice(customerBySlug(slug),`${slug}-${500+index}`,5000+index*750,day(8+index),"paid"); addPayment(customerBySlug(slug),inv,`${slug}-${500+index}`,5000+index*750); }
const openSlugs=["delta","harbour","meridian","nova","pacific","vertex"];
for (const [i,slug] of openSlugs.entries()) {
  for(let j=0;j<5;j++) addInvoice(customerBySlug(slug),`${slug}-${600+i*10+j}`,3200+i*900+j*450,j<2?`2025-01-${String(5+j*12).padStart(2,"0")}`:j===2?"2025-02-20":`2025-03-${String(5+j).padStart(2,"0")}`);
}
for (const slug of ["delta","harbour","meridian","nova","pacific","vertex"]) {
  const eligible=invoices.filter(i=>i.customerId===customerBySlug(slug)).slice(0,2);
  eligible.forEach((inv,j)=>addPayment(inv.customerId,inv.id,`${slug}-p${j}`,Math.round(inv.amount*(j?0.3:0.5))));
}
for (const inv of invoices.filter(i=>!i.duplicateOf && i.status==="open").slice(8,14)) creditNotes.push({id:`credit-${inv.id}`,customerId:inv.customerId,invoiceId:inv.id,number:`CN-${inv.number}`,issuedOn:"2025-02-22",amount:Math.min(750,Math.round(inv.amount*.1)),currency:"SGD"});
payments.push({id:"payment-unmatched-001",reference:"BANK-UNMATCHED-001",paidOn:"2025-02-28",amount:2750,currency:"SGD",status:"unmatched"});

export const demoFollowUpPolicies: BusinessFollowUpPolicy[] = [
  {id:"overdue-critical",name:"45+ day critical follow-up",condition:"overdue",minimumDays:45,action:"priority-follow-up"},
  {id:"overdue-priority",name:"30+ day priority follow-up",condition:"overdue",minimumDays:30,action:"priority-follow-up"},
  {id:"overdue-standard",name:"Standard overdue follow-up",condition:"overdue",minimumDays:1,action:"standard-follow-up"},
  {id:"due-soon",name:"Due within 14 days",condition:"due-soon",withinDays:14,action:"prepare-reminder"},
  {id:"high-value",name:"High-value manager review",condition:"high-value",minimumAmount:25000,action:"manager-review"},
  {id:"disputed",name:"Invoice dispute review",condition:"disputed",action:"manager-review"},
];

export const demoSeedInbox: BusinessInboxItem[] = [
  {id:"inbox-unmatched-payment",issueKey:"unmatched-payment:payment-unmatched-001",type:"unmatched-payment",severity:"warning",relatedEntityType:"payment",relatedEntityId:"payment-unmatched-001",createdAt:"2025-03-01T08:15:00Z",status:"open",title:"Unmatched payment requires investigation",detail:"SGD 2,750 bank receipt has no customer or invoice match.",seeded:true},
  {id:"inbox-duplicate-payment",issueKey:"duplicate-payment:payment-acme-101-duplicate",type:"duplicate-payment",severity:"info",relatedEntityType:"payment",relatedEntityId:"payment-acme-101-duplicate",createdAt:"2025-03-01T08:30:00Z",status:"open",title:"Duplicate payment import detected",detail:"PAY-ACME-101 appears twice in the import feed.",seeded:true},
  {id:"inbox-dispute",issueKey:"invoice-dispute:invoice-riverside-river-401",type:"invoice-dispute",severity:"warning",relatedEntityType:"invoice",relatedEntityId:"invoice-riverside-river-401",createdAt:"2025-03-01T08:40:00Z",status:"open",title:"Riverside invoice dispute",detail:"Customer disputes invoice INV-RIVER-401.",seeded:true},
  {id:"inbox-credit-limit",issueKey:"credit-limit:customer-brightstar",type:"credit-limit",severity:"critical",relatedEntityType:"customer",relatedEntityId:"customer-brightstar",createdAt:"2025-03-01T08:50:00Z",status:"open",title:"Bright Star credit exposure",detail:"Open exposure approaches the SGD 40,000 demo credit limit.",seeded:true},
  {id:"inbox-ambiguous",issueKey:"ambiguous-customer:twin",type:"ambiguous-customer",severity:"warning",relatedEntityType:"customer",relatedEntityId:"customer-twin-north",createdAt:"2025-03-01T09:00:00Z",status:"open",title:"Twin identity is ambiguous",detail:"Two canonical Twin customers match the broad alias and require clarification.",seeded:true},
];

export const demoSeed = {
  meta:{id:"business-meta",schemaVersion:BUSINESS_SCHEMA_VERSION,seedVersion:DEMO_SEED_VERSION,snapshotDate:DEMO_SNAPSHOT_DATE,companyName:DEMO_COMPANY_NAME,seededAt:"2025-03-01T00:00:00Z"} satisfies DemoMeta,
  customers,invoices,payments,creditNotes,followUpPolicies:demoFollowUpPolicies,inbox:demoSeedInbox,
};
