import { beforeEach, describe, expect, test, vi } from 'vitest'
import { signIn, REQUESTER_ID } from '../test/fixtures'
import { requestTranslationUntilSettled, type ChatTranslation } from './chatApi'

describe('translation polling fallback', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
    signIn(REQUESTER_ID, 'REQUESTER')
  })

  test('polls a pending translation until Gemini finishes without a page refresh', async () => {
    const pending:ChatTranslation={messageId:'message-1',sourceLanguage:'en',targetLanguage:'ms',status:'PENDING',text:null}
    const ready:ChatTranslation={...pending,status:'READY',text:'Saya sudah sampai.'}
    const responses=[pending,pending,ready]
    const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      void input;void init
      return new Response(JSON.stringify(responses.shift()),{status:200,headers:{'Content-Type':'application/json'}})
    })
    vi.stubGlobal('fetch',fetchMock)
    const updates:ChatTranslation[]=[]

    const result=await requestTranslationUntilSettled('conversation-1','message-1','ms',{pollIntervalMs:0,maxPolls:3,onUpdate:value=>updates.push(value)})

    expect(result).toEqual(ready)
    expect(updates.map(value=>value.status)).toEqual(['PENDING','PENDING','READY'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/chat/conversations/conversation-1/messages/message-1/translations')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/chat/conversations/conversation-1/messages/message-1/translations/ms')
  })
})
