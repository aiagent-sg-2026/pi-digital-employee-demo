export type RouteName = "home"|"work"|"inbox"|"customers"|"customer"|"history"|"approvals"|"approval"|"task"|"capabilities"|"connections"|"settings";
export interface AppRoute { name:RouteName; path:string; params:Record<string,string>; query:URLSearchParams; }

const ROOTS = new Set(["home","work","inbox","customers","history","approvals","capabilities","connections","settings"]);
const decode=(value:string)=>{try{return decodeURIComponent(value)}catch{return value}};

export function parseHash(hash=window.location.hash):AppRoute{
  const raw=(hash.startsWith("#")?hash.slice(1):hash)||"/home";
  const [pathname,queryString=""]=raw.split("?",2);
  const pieces=pathname.split("/").filter(Boolean).map(decode);
  const query=new URLSearchParams(queryString);
  if(pieces[0]==="tasks"&&pieces[1])return{name:"task",path:`/tasks/${pieces[1]}`,params:{taskId:pieces[1]},query};
  if(pieces[0]==="customers"&&pieces[1])return{name:"customer",path:`/customers/${pieces[1]}`,params:{customerId:pieces[1]},query};
  if(pieces[0]==="approvals"&&pieces[1])return{name:"approval",path:`/approvals/${pieces[1]}`,params:{approvalId:pieces[1]},query};
  const root=pieces[0]&&ROOTS.has(pieces[0])?pieces[0] as RouteName:"home";
  return{name:root,path:`/${root}`,params:{},query};
}

export function routeHref(path:string,query?:Record<string,string|undefined>):string{
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(query??{}))if(value)params.set(key,value);
  return`#${path}${params.size?`?${params.toString()}`:""}`;
}

export function navigate(path:string,query?:Record<string,string|undefined>):void{window.location.hash=routeHref(path,query).slice(1)}

export function navParent(route:AppRoute):RouteName{
  if(route.name==="task")return"work";
  if(route.name==="customer")return"customers";
  if(route.name==="approval")return"approvals";
  return route.name;
}

export interface RouterOptions { onRoute:(route:AppRoute)=>void|Promise<void>; }
export interface RouterStartOptions { initialApply?:boolean; }
export function createHashRouter(options:RouterOptions){
  let started=false;
  const apply=()=>void options.onRoute(parseHash());
  return{
    start({initialApply=true}:RouterStartOptions={}){if(started)return;started=true;window.addEventListener("hashchange",apply);if(!window.location.hash)history.replaceState(null,"",`${location.pathname}${location.search}#/home`);if(initialApply)apply();},
    stop(){if(!started)return;started=false;window.removeEventListener("hashchange",apply);},
    refresh:apply,
  };
}
