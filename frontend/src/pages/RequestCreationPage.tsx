/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 * 
 * Tool: Claude (Sonnet 5.5 Medium)
 * Scope: Assisted with populating fields with supplier info from supplier service
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  Popover,
  Stack,
  TextField,
  Typography,
  MenuItem,
} from '@mui/material'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import type { UserMode } from '../components/AppNavigation'
import { createOrder, fetchOrderById } from '../api/orders'
import { fetchSupplierById } from '../api/suppliers'
import type { Supplier } from '../interfaces'

function parseCreditAmount(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const amount = Number(trimmed)
  if (!Number.isInteger(amount) || amount < 1) return null
  return amount
}

function formatDayMonthYear(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

function parseDayMonthYear(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function CalendarIcon() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      sx={{ width: 22, height: 22, fill: 'currentColor' }}
    >
      <path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm11 8H6v8h12v-8zM6 6v2h12V6H6z" />
    </Box>
  )
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function AcceptanceDateField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const selected = parseDayMonthYear(value)
  const [visibleMonth, setVisibleMonth] = useState(() => selected ?? new Date())

  function openCalendar(event: MouseEvent<HTMLElement>) {
    setVisibleMonth(parseDayMonthYear(value) ?? new Date())
    setAnchor(event.currentTarget)
  }

  const days = useMemo(() => {
    const year = visibleMonth.getFullYear()
    const month = visibleMonth.getMonth()
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7
    const count = new Date(year, month + 1, 0).getDate()
    const cells: Array<Date | null> = Array.from({ length: startOffset }, () => null)
    for (let day = 1; day <= count; day += 1) cells.push(new Date(year, month, day))
    return cells
  }, [visibleMonth])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthLabel = visibleMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <>
      <TextField
        label="Acceptance date"
        placeholder="DD/MM/YYYY"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        fullWidth
        required
        disabled={disabled}
        helperText="Click the date box to open the calendar."
        onClick={(event) => {
          if (!disabled) openCalendar(event)
        }}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label="Choose a date"
                  edge="end"
                  disabled={disabled}
                  onClick={openCalendar}
                >
                  <CalendarIcon />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, width: 280 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Button
              size="small"
              aria-label="Previous month"
              onClick={() =>
                setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))
              }
            >
              ‹
            </Button>
            <Typography sx={{ fontWeight: 650 }}>{monthLabel}</Typography>
            <Button
              size="small"
              aria-label="Next month"
              onClick={() =>
                setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))
              }
            >
              ›
            </Button>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
            {WEEKDAYS.map((label) => (
              <Typography
                key={label}
                variant="caption"
                color="text.secondary"
                sx={{ textAlign: 'center' }}
              >
                {label}
              </Typography>
            ))}
            {days.map((day, index) =>
              day ? (
                <Button
                  key={day.toISOString()}
                  size="small"
                  disabled={day < today}
                  variant={selected && sameDay(day, selected) ? 'contained' : 'text'}
                  onClick={() => {
                    onChange(formatDayMonthYear(day))
                    setAnchor(null)
                  }}
                  sx={{ minWidth: 0, px: 0 }}
                >
                  {day.getDate()}
                </Button>
              ) : (
                <Box key={`empty-${index}`} />
              ),
            )}
          </Box>
        </Box>
      </Popover>
    </>
  )
}

function parseClock(timeText: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(timeText.trim())
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3]?.toLowerCase()
  if (minutes > 59) return null
  if (meridiem) {
    if (hours < 1 || hours > 12) return null
    if (meridiem === 'pm' && hours !== 12) hours += 12
    if (meridiem === 'am' && hours === 12) hours = 0
  } else if (hours > 23) {
    return null
  }
  return { hours, minutes }
}

/** Parses DD/MM/YYYY plus a clock time. Returns an ISO string only when it is in the future. */
function toFutureIso(dateText: string, timeText: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateText.trim())
  const clock = parseClock(timeText)
  if (!match || !clock) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day, clock.hours, clock.minutes, 0, 0)
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === clock.hours &&
    date.getMinutes() === clock.minutes
  if (!valid || date.getTime() <= Date.now()) return null
  return date.toISOString()
}

function deadlineError(dateText: string, timeText: string): string | null {
  if (!/^(\d{2})\/(\d{2})\/(\d{4})$/.test(dateText.trim())) {
    return 'Enter the date as day/month/year, for example 24/10/2026.'
  }
  if (!parseClock(timeText)) {
    return 'Type the time as 10:30, then choose AM or PM.'
  }
  if (!toFutureIso(dateText, timeText)) {
    return 'That deadline is already in the past. Choose a later time.'
  }
  return null
}

function AcceptanceTimeField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const parsed = parseClock(value)
  const [clockText, setClockText] = useState(() => {
    if (!parsed) return ''
    const hour12 = parsed.hours % 12 === 0 ? 12 : parsed.hours % 12
    return `${hour12}:${String(parsed.minutes).padStart(2, '0')}`
  })
  const [meridiem, setMeridiem] = useState(parsed ? (parsed.hours >= 12 ? 'PM' : 'AM') : '')

  function emit(nextClock: string, nextMeridiem: string) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(nextClock.trim())
    if (!match || !nextMeridiem) {
      onChange('')
      return
    }
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (hours < 1 || hours > 12 || minutes > 59) {
      onChange('')
      return
    }
    onChange(`${hours}:${match[2]} ${nextMeridiem}`)
  }

  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          label="Time"
          placeholder="--:--"
          value={clockText}
          onChange={(event) => {
            const nextClock = event.target.value
            setClockText(nextClock)
            emit(nextClock, meridiem)
          }}
          fullWidth
          disabled={disabled}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
        <TextField
          select
          label="AM or PM"
          value={meridiem}
          onChange={(event) => {
            const nextMeridiem = event.target.value
            setMeridiem(nextMeridiem)
            emit(clockText, nextMeridiem)
          }}
          sx={{ minWidth: 130 }}
          disabled={disabled}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value="" sx={{ display: 'none' }} />
          <MenuItem value="AM">AM</MenuItem>
          <MenuItem value="PM">PM</MenuItem>
        </TextField>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Type the time as 10:30, then choose AM or PM.
      </Typography>
    </Stack>
  )
}

type RequestPrefill = {
  title: string
  description: string
  deliveryLocation: string
  creditAmount: number
}

function CreateRequestForm({
  supplier,
  prefill,
}: {
  supplier: Supplier
  prefill?: RequestPrefill | null
}) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(prefill?.title ?? '')
  const [description, setDescription] = useState(prefill?.description ?? '')
  const [deliveryLocation, setDeliveryLocation] = useState(prefill?.deliveryLocation ?? '')
  const [creditAmount, setCreditAmount] = useState(
    prefill ? String(prefill.creditAmount) : '',
  )
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineTime, setDeadlineTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const pickupLocation = `${supplier.name}, ${supplier.building}, Level ${supplier.floor}`

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    const trimmedDelivery = deliveryLocation.trim()
    const amount = parseCreditAmount(creditAmount)
    const deadlineProblem = deadlineError(deadlineDate, deadlineTime)
    const acceptBy = deadlineProblem ? null : toFutureIso(deadlineDate, deadlineTime)

    if (!trimmedTitle || trimmedTitle.length > 255) {
      setErrorMessage('Title is required and must be 255 characters or fewer.')
      return
    }
    if (trimmedDescription.length > 255) {
      setErrorMessage('Item description must be 255 characters or fewer.')
      return
    }
    if (!trimmedDelivery || trimmedDelivery.length > 255) {
      setErrorMessage('Delivery location is required and must be 255 characters or fewer.')
      return
    }
    if (amount === null) {
      setErrorMessage('Credit amount must be a whole number of at least 1.')
      return
    }
    if (deadlineProblem || !acceptBy) {
      setErrorMessage(deadlineProblem ?? 'Enter a deadline in the future.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    try {
      await createOrder({
        title: trimmedTitle,
        description: trimmedDescription,
        supplierId: supplier.id,
        deliveryLocation: trimmedDelivery,
        creditAmount: amount,
        acceptBy,
      })
      navigate('/requests')
    } catch (error) {
      console.error(error)
      setErrorMessage(error instanceof Error ? error.message : 'The request could not be created.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Container component="main" maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={3} component="form" onSubmit={handleSubmit}>
        <Box>
          <Typography component="h1" variant="h4">
            Create Request
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Pickup will be at {supplier.name}.
          </Typography>
        </Box>

        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2.5, md: 3.5 },
            borderColor: 'divider',
            boxShadow: '0 8px 24px rgba(23, 35, 45, 0.05)',
          }}
        >
          <Stack spacing={2.5}>
            <TextField
              label="Pickup location"
              value={pickupLocation}
              fullWidth
              slotProps={{ input: { readOnly: true } }}
              helperText="Prefilled from the selected supplier."
            />
            <TextField
              label="Title"
              placeholder="Chicken rice"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              fullWidth
              required
              disabled={submitting}
              helperText="Short name sent as the order title."
            />
            <TextField
              label="Item description"
              placeholder="What should the courier collect?"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              fullWidth
              multiline
              minRows={3}
              disabled={submitting}
              helperText="Optional detail. Sent separately from the title."
            />
            <TextField
              label="Delivery location"
              placeholder="Where should it be delivered?"
              value={deliveryLocation}
              onChange={(event) => setDeliveryLocation(event.target.value)}
              fullWidth
              required
              disabled={submitting}
            />
            <TextField
              label="Credit amount offered"
              placeholder="1"
              type="number"
              value={creditAmount}
              onChange={(event) => setCreditAmount(event.target.value)}
              fullWidth
              required
              disabled={submitting}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              helperText="Whole number of at least 1."
            />
            <AcceptanceDateField
              value={deadlineDate}
              onChange={setDeadlineDate}
              disabled={submitting}
            />
            <AcceptanceTimeField
              value={deadlineTime}
              onChange={setDeadlineTime}
              disabled={submitting}
            />
          </Stack>
        </Paper>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create request'}
          </Button>
          <Button
            component={Link}
            to={`/suppliers/${supplier.id}`}
            variant="outlined"
            disabled={submitting}
            sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' } }}
          >
            Back to supplier
          </Button>
        </Stack>
      </Stack>
    </Container>
  )
}

type RequestCreationPageProps = {
  mode: UserMode
}

function RequestCreationPage({ mode }: RequestCreationPageProps) {
  const [searchParams] = useSearchParams()
  const supplierId = searchParams.get('supplierId')
  const reorderFrom = searchParams.get('reorderFrom')

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [prefill, setPrefill] = useState<RequestPrefill | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!supplierId || mode !== 'requester') {
      setStatus('ready')
      return
    }
    let cancelled = false
    setStatus('loading')
    // A failed order lookup only skips the prefill; the supplier is what matters.
    const prefillPromise = reorderFrom
      ? fetchOrderById(reorderFrom).catch((error) => {
          console.error(error)
          return null
        })
      : Promise.resolve(null)
    Promise.all([fetchSupplierById(supplierId), prefillPromise])
      .then(([data, source]) => {
        if (cancelled) return
        setSupplier(data)
        setPrefill(
          source && source.pickup.supplierId === supplierId
            ? {
                title: source.title ?? '',
                description: source.description ?? '',
                deliveryLocation: source.deliveryLocation,
                creditAmount: source.creditAmount,
              }
            : null,
        )
        setStatus('ready')
      })
      .catch((error) => {
        if (cancelled) return
        console.error(error)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [supplierId, reorderFrom, mode])

  if (mode !== 'requester') {
    return <Navigate to="/home" replace />
  }

  if (status === 'loading') {
    return (
      <Container component="main" maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
        <Typography color="text.secondary">Loading supplier…</Typography>
      </Container>
    )
  }

  if (status === 'error') {
    return (
      <Container component="main" maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h4">
            Couldn&apos;t load supplier
          </Typography>
          <Typography color="text.secondary">
            Something went wrong while loading the supplier. Please try again.
          </Typography>
          <Button component={Link} to="/suppliers" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
            Back to suppliers
          </Button>
        </Stack>
      </Container>
    )
  }

  if (!supplier) {
    return (
      <Container component="main" maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h4">
            Supplier not found
          </Typography>
          <Typography color="text.secondary">
            Choose a supplier before starting a request.
          </Typography>
          <Button component={Link} to="/suppliers" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
            Back to suppliers
          </Button>
        </Stack>
      </Container>
    )
  }

  return <CreateRequestForm supplier={supplier} prefill={prefill} />
}

export default RequestCreationPage
