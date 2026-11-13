import { ApiError } from '@/lib/http'
import { Notice } from './Notice'

type FormErrorProps = {
  error: unknown
  // Fields the form already shows under their inputs. Their messages are not repeated here.
  fields?: string[]
}

export function FormError({ error, fields = [] }: FormErrorProps) {
  if (!error) return null

  if (!(error instanceof ApiError)) {
    return <Notice tone="danger" role="alert" title="Something went wrong" />
  }

  const otherFields = Object.entries(error.fieldErrors).filter(([field]) => !fields.includes(field))

  return (
    <Notice tone="danger" role="alert" title={error.message}>
      {otherFields.length > 0 && (
        <ul className="grid grid-cols-1 gap-1">
          {otherFields.map(([field, messages]) => (
            <li key={field}>
              {field}: {messages.join(', ')}
            </li>
          ))}
        </ul>
      )}
    </Notice>
  )
}