import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/http'
import type { Paginated } from '@/lib/http'
import type { FiledReport, Report, ReportOutcome, ReportState } from './types'

export type ReportFilters = {
  page: number
  pageSize: number
  state?: ReportState
  reportedId?: string
}

const reportKeys = {
  list: (filters: ReportFilters) => ['user', 'reports', filters] as const,
  detail: (id: string) => ['user', 'report', id] as const,
}

// F5.5.4: newest first. Administrators only, like everything below except useCreateReport.
export function useReports(filters: ReportFilters) {
  return useQuery({
    queryKey: reportKeys.list(filters),
    queryFn: ({ signal }) => request<Paginated<Report>>('user', '/reports', { query: filters, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useReport(id: string) {
  return useQuery({
    queryKey: reportKeys.detail(id),
    queryFn: ({ signal }) => request<Report>('user', `/reports/${id}`, { signal }),
  })
}

export type ReportDecision = {
  outcome: ReportOutcome
  justification: string
}

// F1.6.7: Actioned also suspends the reported account, so accounts reload as well as reports.
export function useDecideReport(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (decision: ReportDecision) =>
      request<Report>('user', `/reports/${id}/decision`, { method: 'POST', body: decision }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user'] }),
  })
}

export type NewReport = {
  reportedId: string
  errandId: string
  reason: string
}

// F1.6.3, for any logged-in account. Members can read no reports, so there is nothing to reload.
export function useCreateReport() {
  return useMutation({
    mutationFn: (report: NewReport) => request<FiledReport>('user', '/reports', { method: 'POST', body: report }),
  })
}
