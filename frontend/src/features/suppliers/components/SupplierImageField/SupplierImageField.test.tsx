import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SupplierImageField } from './SupplierImageField'

const renderField = (previewUrl: string | null, hasSavedImage: boolean) => {
  const onChange = vi.fn()
  render(
    <SupplierImageField
      previewUrl={previewUrl}
      hasSavedImage={hasSavedImage}
      onChange={onChange}
    />,
  )
  return onChange
}

describe('SupplierImageField', () => {
  it('only offers Upload when there is no image', () => {
    renderField(null, false)
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('uploads a chosen JPEG or PNG and rejects other files', async () => {
    const onChange = renderField(null, false)
    const input = screen.getByLabelText('Supplier image file')
    const photo = new File(['x'], 'photo.png', { type: 'image/png' })

    await userEvent.upload(input, photo)
    expect(onChange).toHaveBeenCalledWith({ type: 'upload', file: photo })

    onChange.mockClear()
    await userEvent.upload(
      input,
      new File(['x'], 'anim.gif', { type: 'image/gif' }),
      { applyAccept: false },
    )
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG or PNG')
  })

  it('removes the saved image', async () => {
    const onChange = renderField('/api/suppliers/1/image?v=1', true)
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onChange).toHaveBeenCalledWith({ type: 'remove' })
  })

  it('clearing an unsaved choice leaves nothing to remove', async () => {
    const onChange = renderField('blob:chosen', false)
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onChange).toHaveBeenCalledWith({ type: 'keep' })
  })
})
