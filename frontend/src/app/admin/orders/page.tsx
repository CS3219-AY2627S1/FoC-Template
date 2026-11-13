import { AdminOrders } from "@/components/admin/admin-orders"

export default async function AdminOrdersPage({ searchParams }: {
  searchParams: Promise<{ orderId?: string | string[] }>
}) {
  const { orderId } = await searchParams
  return <AdminOrders initialSearchOrderId={typeof orderId === "string" ? orderId : ""} />
}
