import { AdminOrders } from "@/components/admin/admin-orders"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminOrders initialOrderId={id} />
}
