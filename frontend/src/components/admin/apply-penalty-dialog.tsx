"use client"

import { useCallback,useRef,useState } from "react"
import { toast } from "sonner"
import { useAdminApi } from "@/hooks/use-admin-api"
import { useAdminPage } from "@/hooks/use-admin-page"
import type { AdminOrder,ApplyPenaltyInput } from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog"
import { AdminLoadState } from "./admin-ui"
const label=(policy:string)=>policy.replaceAll("_"," ").toLowerCase().replace(/^./,letter=>letter.toUpperCase())
export function ApplyPenaltyDialog({orderId,onClose,onSaved}:{orderId:string;onClose:()=>void;onSaved:(order:AdminOrder)=>void}) {
  const api=useAdminApi()
  const load=useCallback(async(signal:AbortSignal)=>{const [order,policies]=await Promise.all([api.order(orderId,signal),api.penaltyPolicies(signal)]);return {order,policies}},[api,orderId])
  const {data,loading,error,refresh}=useAdminPage(load)
  const [policy,setPolicy]=useState<string|null>(null)
  const [reason,setReason]=useState("")
  const [request,setRequest]=useState<ApplyPenaltyInput|null>(null)
  const [failure,setFailure]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const locked=useRef(false)
  const allowed=Boolean(data?.order.courierId && ["ACCEPTED","IN_PROGRESS","PICKED_UP","DELIVERED"].includes(data.order.status))
  async function submit(event:React.FormEvent) {
    event.preventDefault()
    if(locked.current||!data?.order.courierId||!allowed||!policy||!reason.trim())return
    const body=request??{commandId:crypto.randomUUID(),courierId:data.order.courierId,expectedVersion:data.order.version,policy,reason:reason.trim()}
    setRequest(body);locked.current=true;setBusy(true);setFailure(null)
    try {
      const result=await api.applyPenalty(orderId,body)
      toast.success("Highest penalty stored. It will be processed at the final order outcome.")
      onSaved(result)
    }catch(cause){setFailure(cause instanceof Error?cause.message:"Could not store penalty. Please retry.")}
    finally{locked.current=false;setBusy(false)}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}><DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg"><form className="flex min-h-0 flex-col gap-4" onSubmit={submit}>
    <DialogHeader><DialogTitle>Apply penalty</DialogTitle><DialogDescription>Store a penalty for this courier attempt. Only the highest is kept and it cannot be cleared.</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-4 overflow-y-auto px-1">
      <AdminLoadState loading={loading} error={error} empty={false} retry={refresh}/>
      {data&&<>
        <p className="text-sm">Stored penalty: {data.order.appliedPenalty?label(data.order.appliedPenalty)+" · "+data.order.appliedPenaltyAmount+" points":"None"}</p>
        {data.order.appliedPenaltyReason&&<p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{data.order.appliedPenaltyReason}</p>}
        {!allowed&&<p className="text-sm text-muted-foreground">Only an assigned active order can receive a penalty. Finalized outcomes cannot be adjusted.</p>}
        <fieldset disabled={busy||Boolean(request)||!allowed} className="space-y-3"><legend className="mb-2 text-sm font-medium">Penalty case</legend>
          {[...data.policies].sort((a,b)=>a.penaltyAmount-b.penaltyAmount).map(item=><label key={item.policy} className="flex items-start justify-between gap-3 text-sm"><span className="flex gap-2"><input type="radio" name="report-penalty" checked={policy===item.policy} onChange={()=>setPolicy(item.policy)}/>{label(item.policy)}</span><span className="shrink-0 text-muted-foreground">{item.penaltyAmount} points</span></label>)}
        </fieldset>
        <div className="space-y-2"><Label htmlFor="penalty-reason">Penalty reason</Label><Textarea id="penalty-reason" maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} disabled={busy||Boolean(request)||!allowed}/></div>
        <p className="text-xs text-muted-foreground">A lower or equal selection leaves the existing penalty unchanged. Cancellation never automatically adds an overdue penalty.</p>
      </>}
      {failure&&<p role="alert" className="text-sm text-destructive">{failure}</p>}
    </div>
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Back</Button><Button type="submit" disabled={busy||!allowed||!policy||!reason.trim()}>{busy?"Saving…":request?"Retry penalty":"Confirm penalty"}</Button></DialogFooter>
  </form></DialogContent></Dialog>
}
