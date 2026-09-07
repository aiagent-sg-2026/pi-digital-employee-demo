import { STORES, getAllByIndex, getAllRecords, getRecord, putRecord } from "./indexeddb";
import type { BusinessApproval, BusinessEvidence, BusinessInboxItem, BusinessTask, DraftAction, InboxStatus, IssueMessageParams, TaskEvent } from "./models";

export interface WorkRepository {
  createTask(task:BusinessTask):Promise<void>; updateTask(task:BusinessTask):Promise<void>; getTask(id:string):Promise<BusinessTask|undefined>; listTaskHistory():Promise<BusinessTask[]>;
  appendTaskEvent(event:TaskEvent):Promise<void>; listTaskEvents(taskId:string):Promise<TaskEvent[]>;
  saveEvidence(evidence:BusinessEvidence):Promise<void>; listEvidence(taskId:string):Promise<BusinessEvidence[]>;
  saveApproval(approval:BusinessApproval):Promise<void>; getApproval(id:string):Promise<BusinessApproval|undefined>; listApprovals():Promise<BusinessApproval[]>;
  saveInboxItem(item:BusinessInboxItem):Promise<void>; upsertInboxIssue(item:BusinessInboxItem):Promise<BusinessInboxItem>; listInbox():Promise<BusinessInboxItem[]>; updateInboxStatus(id:string,status:InboxStatus,resolution?:string,presentation?:{key:string;params?:IssueMessageParams}):Promise<void>; linkInboxToTask(id:string,taskId:string):Promise<void>;
  saveDraftAction(action:DraftAction):Promise<void>; listDraftActions(taskId:string):Promise<DraftAction[]>;
}
export class IndexedDbWorkRepository implements WorkRepository {
  createTask(task:BusinessTask){return putRecord(STORES.tasks,task)} updateTask(task:BusinessTask){return putRecord(STORES.tasks,task)} getTask(id:string){return getRecord<BusinessTask>(STORES.tasks,id)}
  async listTaskHistory(){return (await getAllRecords<BusinessTask>(STORES.tasks)).sort((a,b)=>(b.updatedAt??b.createdAt).localeCompare(a.updatedAt??a.createdAt));}
  appendTaskEvent(event:TaskEvent){return putRecord(STORES.taskEvents,event)} async listTaskEvents(taskId:string){return (await getAllByIndex<TaskEvent>(STORES.taskEvents,"taskId",taskId)).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));}
  saveEvidence(evidence:BusinessEvidence){return putRecord(STORES.evidence,evidence)} listEvidence(taskId:string){return getAllByIndex<BusinessEvidence>(STORES.evidence,"taskId",taskId)}
  saveApproval(approval:BusinessApproval){return putRecord(STORES.approvals,approval)} getApproval(id:string){return getRecord<BusinessApproval>(STORES.approvals,id)} listApprovals(){return getAllRecords<BusinessApproval>(STORES.approvals)}
  saveInboxItem(item:BusinessInboxItem){return putRecord(STORES.inbox,item)}
  async upsertInboxIssue(item:BusinessInboxItem){
    const all=await getAllRecords<BusinessInboxItem>(STORES.inbox);
    const existing=item.issueKey?all.find(candidate=>candidate.issueKey===item.issueKey&&candidate.status!=="resolved"):undefined;
    if(!existing){await putRecord(STORES.inbox,item);return item;}
    const merged:BusinessInboxItem={...existing,...item,id:existing.id,createdAt:existing.createdAt,status:item.status==="resolved"?"resolved":existing.status==="resolved"?"open":existing.status,relatedTaskIds:[...new Set([...(existing.relatedTaskIds??[]),...(item.relatedTaskIds??[])]) ]};
    await putRecord(STORES.inbox,merged);return merged;
  }
  async listInbox(){return (await getAllRecords<BusinessInboxItem>(STORES.inbox)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  async updateInboxStatus(id:string,status:InboxStatus,resolution?:string,presentation?:{key:string;params?:IssueMessageParams}){const item=await getRecord<BusinessInboxItem>(STORES.inbox,id);if(!item)return;await putRecord(STORES.inbox,{...item,status,resolution,resolutionKey:presentation?.key??item.resolutionKey,resolutionParams:presentation?.params??item.resolutionParams});}
  async linkInboxToTask(id:string,taskId:string){const item=await getRecord<BusinessInboxItem>(STORES.inbox,id);if(!item)return;await putRecord(STORES.inbox,{...item,relatedTaskIds:[...new Set([...(item.relatedTaskIds??[]),taskId])]});}
  saveDraftAction(action:DraftAction){return putRecord(STORES.draftActions,action)} listDraftActions(taskId:string){return getAllByIndex<DraftAction>(STORES.draftActions,"taskId",taskId)}
}
