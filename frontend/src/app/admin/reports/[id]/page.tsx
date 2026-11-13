import { AdminReportsPage } from "@/components/reports/reports-page"
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AdminReportsPage reportId={id} /> }
