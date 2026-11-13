import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { preserveTranslations, type ChatMessage } from '../api/chatApi'
import { MessageBubble } from './ChatPage'

function textMessage(overrides:Partial<ChatMessage>={}):ChatMessage {
  return {
    id:'10000000-0000-4000-8000-000000000002',
    conversationId:'20000000-0000-4000-8000-000000000001',
    senderUserId:'40000000-0000-4000-8000-000000000001',
    sequence:2,
    clientMessageId:'50000000-0000-4000-8000-000000000001',
    messageType:'TEXT',
    originalLanguage:'en',
    quickReplyKey:null,
    text:'I am on my way.',
    attachment:null,
    sourceEventId:null,
    sourceSequence:null,
    lifecycleAction:null,
    lifecycleFromState:null,
    lifecycleToState:null,
    createdAt:'2026-11-08T04:31:00Z',
    ...overrides,
  }
}

describe('chat lifecycle activity', () => {
  test('renders a lifecycle event as a timestamped system entry instead of a participant bubble', () => {
    const message: ChatMessage = {
      id: '10000000-0000-4000-8000-000000000001',
      conversationId: '20000000-0000-4000-8000-000000000001',
      senderUserId: null,
      sequence: 1,
      clientMessageId: null,
      messageType: 'SYSTEM',
      originalLanguage: null,
      quickReplyKey: null,
      text: 'Courier marked the errand as picked up.',
      attachment: null,
      sourceEventId: '30000000-0000-4000-8000-000000000001',
      sourceSequence: 4,
      lifecycleAction: 'PICK_UP',
      lifecycleFromState: 'ACCEPTED',
      lifecycleToState: 'PICKED_UP',
      createdAt: '2026-11-08T04:30:00Z',
    }

    const { container } = render(<MessageBubble message={message} mine={false} preferredLanguage="en" />)

    expect(screen.getByText('Courier marked the errand as picked up.')).toBeInTheDocument()
    expect(container.querySelector('.system-message')).toBeInTheDocument()
    expect(container.querySelector('.message-author')).not.toBeInTheDocument()
    expect(screen.getByText(/2026/).closest('time')).toHaveAttribute('datetime', message.createdAt)
  })

  test('shows a ready translation while preserving an accessible original', async () => {
    const message: ChatMessage = textMessage({
      translation: { messageId:'10000000-0000-4000-8000-000000000002',sourceLanguage:'en',targetLanguage:'zh',status:'READY',text:'我正在路上。' },
    })

    const user = (await import('@testing-library/user-event')).default.setup()
    render(<MessageBubble message={message} mine={false} preferredLanguage="zh" />)
    expect(screen.getByText('我正在路上。')).toBeInTheDocument()
    expect(screen.queryByText('I am on my way.')).not.toBeInTheDocument()
    expect(screen.queryByText('Other participant')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'View original'}))
    expect(screen.getByText('I am on my way.')).toBeInTheDocument()
  })

  test('selecting the original language restores the original without using the toggle', () => {
    const message: ChatMessage = textMessage({
      translation: { messageId:'10000000-0000-4000-8000-000000000002',sourceLanguage:'en',targetLanguage:'zh',status:'READY',text:'我正在路上。' },
    })

    render(<MessageBubble message={message} mine={false} preferredLanguage="en" />)

    expect(screen.getByText('I am on my way.')).toBeInTheDocument()
    expect(screen.queryByText('我正在路上。')).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'View original'})).not.toBeInTheDocument()
  })

  test('does not show a cached translation for a different selected language', () => {
    const message: ChatMessage = textMessage({
      translation: { messageId:'10000000-0000-4000-8000-000000000002',sourceLanguage:'en',targetLanguage:'zh',status:'READY',text:'我正在路上。' },
    })

    render(<MessageBubble message={message} mine={false} preferredLanguage="ms" />)

    expect(screen.getByText('I am on my way.')).toBeInTheDocument()
    expect(screen.queryByText('我正在路上。')).not.toBeInTheDocument()
  })

  test('omits participant labels from both sides of the conversation', () => {
    const { rerender } = render(<MessageBubble message={textMessage()} mine={false} preferredLanguage="en" />)
    expect(screen.queryByText('Other participant')).not.toBeInTheDocument()

    rerender(<MessageBubble message={textMessage()} mine preferredLanguage="en" />)
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })

  test('keeps live translation updates and preserves them across history refreshes', () => {
    const ready = {messageId:'10000000-0000-4000-8000-000000000002',sourceLanguage:'en',targetLanguage:'ms',status:'READY' as const,text:'Saya sedang dalam perjalanan.'}

    const liveUpdate = preserveTranslations([textMessage()], [textMessage({translation:ready})])
    expect(liveUpdate.at(0)?.translation).toEqual(ready)

    const historyRefresh = preserveTranslations(liveUpdate, [textMessage({translation:null})])
    expect(historyRefresh.at(0)?.translation).toEqual(ready)
  })
})
