/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  fetchMyCreditActivity,
  fetchMyWallet,
} from '../api/credits'
import {
  creditOperationDisplay,
  formatCreditAmount,
  formatOrderRef,
  type CreditActivityItem,
  type CreditWallet,
} from '../credits/creditTypes'

type CreditsRequestResult = {
  key: number
  wallet?: CreditWallet
  activity?: CreditActivityItem[]
  error?: string
}

const sectionPaperSx = {
  p: { xs: 2, md: 3 },
  bgcolor: 'background.paper',
  boxShadow: '0 8px 24px rgba(23, 35, 45, 0.05)',
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function BalanceCard({
  label,
  value,
  helper,
  emphasize,
}: {
  label: string
  value: number
  helper: string
  emphasize?: boolean
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, md: 2.5 },
        height: '100%',
        borderColor: emphasize ? 'primary.main' : 'divider',
        bgcolor: emphasize ? 'primary.light' : 'background.paper',
      }}
    >
      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }}>
          {label}
        </Typography>
        <Typography
          variant="h4"
          sx={{ fontWeight: 750, color: emphasize ? 'primary.dark' : 'text.primary' }}
        >
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {helper}
        </Typography>
      </Stack>
    </Paper>
  )
}

function BalanceSkeleton() {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
        gap: 2,
      }}
      aria-hidden="true"
    >
      {[0, 1, 2].map((key) => (
        <Paper key={key} variant="outlined" sx={{ p: 2.5 }}>
          <Skeleton width="40%" />
          <Skeleton width="30%" height={40} sx={{ mt: 1 }} />
          <Skeleton width="70%" sx={{ mt: 1 }} />
        </Paper>
      ))}
    </Box>
  )
}

function ActivityRowMobile({ item }: { item: CreditActivityItem }) {
  const display = creditOperationDisplay[item.operationType]
  const amountLabel =
    item.signedAmount > 0
      ? `+${formatCreditAmount(item.amount)}`
      : item.signedAmount < 0
        ? `−${formatCreditAmount(item.amount)}`
        : formatCreditAmount(item.amount)

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
          <Chip size="small" label={display.label} color={display.color} />
          <Typography
            sx={{
              fontWeight: 700,
              color:
                item.signedAmount > 0
                  ? 'success.dark'
                  : item.signedAmount < 0
                    ? 'warning.dark'
                    : 'text.primary',
            }}
          >
            {amountLabel}
          </Typography>
        </Stack>
        <Typography variant="body2">{item.description}</Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(item.createdAt)}
          {item.orderId ? ` · Order ${formatOrderRef(item.orderId)}` : ''}
        </Typography>
      </Stack>
    </Paper>
  )
}

/** Embeddable wallet + activity panel used by the Account Credits tab. */
function CreditsPanel() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { user } = useAuth()
  const userId = user?.id
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<CreditsRequestResult | null>(null)

  const loading = result?.key !== reloadCount
  const wallet = !loading ? result?.wallet : undefined
  const activity = !loading ? result?.activity : undefined
  const errorMessage = !loading ? result?.error : undefined

  useEffect(() => {
    let ignore = false
    if (!userId) return

    Promise.all([fetchMyWallet(userId), fetchMyCreditActivity(userId)])
      .then(([walletData, activityData]) => {
        if (ignore) return
        setResult({ key: reloadCount, wallet: walletData, activity: activityData })
      })
      .catch((error: unknown) => {
        if (ignore) return
        console.error(error)
        setResult({
          key: reloadCount,
          error: 'Your credit balance could not be loaded.',
        })
      })

    return () => {
      ignore = true
    }
  }, [reloadCount, userId])

  return (
    <Stack spacing={2.5}>
      {loading ? (
        <BalanceSkeleton />
      ) : errorMessage ? (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setReloadCount((count) => count + 1)}
            >
              Retry
            </Button>
          }
        >
          {errorMessage}
        </Alert>
      ) : (
        wallet && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
              gap: 2,
            }}
          >
            <BalanceCard
              label="Total balance"
              value={wallet.totalCredits}
              helper="Sum of available and reserved credits"
              emphasize
            />
            <BalanceCard
              label="Available"
              value={wallet.availableCredits}
              helper="Ready to offer on new requests"
            />
            <BalanceCard
              label="Reserved"
              value={wallet.reservedCredits}
              helper="Held for open or accepted orders"
            />
          </Box>
        )
      )}

      {!loading && !errorMessage && (
        <Paper variant="outlined" component="section" sx={sectionPaperSx}>
          <Stack spacing={2}>
            <Stack spacing={0.25}>
              <Typography component="h2" variant="h6" sx={{ fontWeight: 650 }}>
                Recent activity
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Allocations, reservations, releases, and earnings from deliveries.
              </Typography>
            </Stack>

            {!activity || activity.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{ p: 3, textAlign: 'center', bgcolor: 'background.default' }}
              >
                <Typography variant="h6">No credit activity yet</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  Activity will appear here after you create orders or complete deliveries.
                </Typography>
              </Paper>
            ) : isMobile ? (
              <Stack spacing={1.5}>
                {activity.map((item) => (
                  <ActivityRowMobile key={item.id} item={item} />
                ))}
              </Stack>
            ) : (
              <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Table size="small" aria-label="Credit activity">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Order</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activity.map((item) => {
                      const display = creditOperationDisplay[item.operationType]
                      const amountLabel =
                        item.signedAmount > 0
                          ? `+${item.amount}`
                          : item.signedAmount < 0
                            ? `−${item.amount}`
                            : String(item.amount)

                      return (
                        <TableRow key={item.id} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {formatDateTime(item.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={display.label} color={display.color} />
                          </TableCell>
                          <TableCell
                            sx={{
                              fontWeight: 700,
                              color:
                                item.signedAmount > 0
                                  ? 'success.dark'
                                  : item.signedAmount < 0
                                    ? 'warning.dark'
                                    : 'text.primary',
                            }}
                          >
                            {amountLabel}
                          </TableCell>
                          <TableCell>
                            {item.orderId ? (
                              <Button
                                component={Link}
                                to={`/requests/${item.orderId}`}
                                size="small"
                                sx={{ textTransform: 'none', minWidth: 0, px: 0.5 }}
                              >
                                {formatOrderRef(item.orderId)}
                              </Button>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 320 }}>
                            <Typography variant="body2">{item.description}</Typography>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}

export default CreditsPanel
