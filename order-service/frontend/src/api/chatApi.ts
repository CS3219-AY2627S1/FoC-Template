import { Client } from '@stomp/stompjs'
import { expireSession, readSession } from '../auth/session'

export type Conversation = { id: string; orderId: string; status: 'ACTIVE' | 'READ_ONLY'; readOnly: boolean }
export type Attachment = { id: string; contentType: string; filename: string; size: number }
export type ChatTranslation = { messageId:string; sourceLanguage:string; targetLanguage:string; status:'PENDING'|'READY'|'FAILED'; text:string|null }
export type ChatMessage = { id: string; conversationId: string; senderUserId: string|null; sequence: number; clientMessageId: string|null; messageType: 'TEXT'|'QUICK_REPLY'|'IMAGE'|'SYSTEM'; originalLanguage: string|null; quickReplyKey: string|null; text: string|null; attachment: Attachment|null; sourceEventId: string|null; sourceSequence: number|null; lifecycleAction: string|null; lifecycleFromState: string|null; lifecycleToState: string|null; createdAt: string; translation?:ChatTranslation|null }
export type ChatTranslationEvent = { type:'TRANSLATION_UPDATED'; conversationId:string; translation:ChatTranslation }
export type QuickReply = { key: string; language: string; text: string }

export function preserveTranslations(oldData:ChatMessage[]|undefined,newData:ChatMessage[]):ChatMessage[]{
  return newData.map(message=>({
    ...message,
    // A setQueryData update carries the newest translation, while the history API
    // currently returns null. Prefer a new translation and only fall back to the
    // cached one during the five-second history reconciliation.
    translation:message.translation??oldData?.find(previous=>previous.id===message.id)?.translation,
  }))
}

export class ChatApiError extends Error { constructor(readonly status:number,message:string){super(message)} }
async function request<T>(path:string,init:RequestInit={}):Promise<T>{const s=readSession();if(!s)throw new ChatApiError(401,'Sign in is required');const h=new Headers(init.headers);h.set('Authorization',`${s.tokenType} ${s.accessToken}`);h.set('Accept','application/json');const r=await fetch(path,{...init,headers:h});if(r.status===401)expireSession();if(!r.ok){let message='Chat is unavailable. Please try again.';try{message=((await r.json()) as {detail?:string}).detail??message}catch{/* use fallback */}throw new ChatApiError(r.status,message)}return await r.json() as T}
export const fetchConversation=(orderId:string)=>request<Conversation>(`/api/chat/orders/${encodeURIComponent(orderId)}/conversation`)
export const fetchMessages=(id:string,after=0)=>request<ChatMessage[]>(`/api/chat/conversations/${id}/messages?after=${after}&limit=100`)
export const fetchQuickReplies=()=>request<{content:QuickReply[]}>('/api/chat/quick-replies')
export const fetchPreference=()=>request<{preferredLanguage:string}>('/api/chat/preferences')
export const savePreference=(preferredLanguage:string)=>request<{preferredLanguage:string}>('/api/chat/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({preferredLanguage})})
export const sendMessage=(id:string,body:Record<string,unknown>)=>request<ChatMessage>(`/api/chat/conversations/${id}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientMessageId:crypto.randomUUID(),...body})})
export const requestTranslation=(id:string,messageId:string,targetLanguage:string,signal?:AbortSignal)=>request<ChatTranslation>(`/api/chat/conversations/${id}/messages/${messageId}/translations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetLanguage}),signal})
export const fetchTranslation=(id:string,messageId:string,targetLanguage:string,signal?:AbortSignal)=>request<ChatTranslation>(`/api/chat/conversations/${id}/messages/${messageId}/translations/${encodeURIComponent(targetLanguage)}`,{signal})
type TranslationPollingOptions={signal?:AbortSignal;pollIntervalMs?:number;maxPolls?:number;onUpdate?:(translation:ChatTranslation)=>void}
const waitForPoll=(delay:number,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Translation polling was cancelled','AbortError'));return}
  const abort=()=>{window.clearTimeout(timer);reject(new DOMException('Translation polling was cancelled','AbortError'))}
  const timer=window.setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},delay)
  signal?.addEventListener('abort',abort,{once:true})
})
export async function requestTranslationUntilSettled(id:string,messageId:string,targetLanguage:string,options:TranslationPollingOptions={}):Promise<ChatTranslation>{
  const {signal,pollIntervalMs=1500,maxPolls=40,onUpdate}=options
  let translation=await requestTranslation(id,messageId,targetLanguage,signal)
  onUpdate?.(translation)
  for(let attempt=0;translation.status==='PENDING'&&attempt<maxPolls;attempt+=1){
    await waitForPoll(pollIntervalMs,signal)
    translation=await fetchTranslation(id,messageId,targetLanguage,signal)
    onUpdate?.(translation)
  }
  return translation
}
export async function uploadImage(id:string,file:File):Promise<Attachment>{const data=new FormData();data.set('file',file);return request<Attachment>(`/api/chat/conversations/${id}/attachments`,{method:'POST',body:data})}
export async function fetchImage(id:string,attachmentId:string):Promise<string>{const s=readSession();if(!s)throw new Error('Sign in required');const r=await fetch(`/api/chat/conversations/${id}/attachments/${attachmentId}`,{headers:{Authorization:`${s.tokenType} ${s.accessToken}`}});if(!r.ok)throw new Error('Image unavailable');return URL.createObjectURL(await r.blob())}
function chatSocketUrl():string{
  const configured=import.meta.env.VITE_CHAT_WS_URL as string|undefined
  if(configured)return configured
  const scheme=location.protocol==='https:'?'wss':'ws'
  // The local MVC gateway proxies HTTP APIs but cannot tunnel WebSocket upgrades.
  // Chat therefore exposes its authenticated socket directly during local development.
  const authority=location.hostname==='localhost'&&location.port==='8088'?`${location.hostname}:8085`:location.host
  return `${scheme}://${authority}/ws/chat`
}
export function subscribeToChat(
  id:string,
  onMessage:(message:ChatMessage)=>void,
  onTranslation:(event:ChatTranslationEvent)=>void,
  onConnected?:()=>void,
):()=>void{
  const s=readSession()
  if(!s)return()=>{}
  const client=new Client({
    brokerURL:chatSocketUrl(),
    connectHeaders:{Authorization:`Bearer ${s.accessToken}`},
    reconnectDelay:2000,
    onConnect:()=>{
      // Reconcile persisted history before listening again. This closes the gap where
      // Kafka/RabbitMQ handled a lifecycle event while this browser was reconnecting.
      onConnected?.()
      client.subscribe('/user/queue/chat',(frame)=>{
        const event=JSON.parse(frame.body) as ChatMessage|ChatTranslationEvent
        if(event.conversationId!==id)return
        if('type' in event&&event.type==='TRANSLATION_UPDATED')onTranslation(event)
        else onMessage(event as ChatMessage)
      })
    },
  })
  client.activate()
  return()=>void client.deactivate()
}
