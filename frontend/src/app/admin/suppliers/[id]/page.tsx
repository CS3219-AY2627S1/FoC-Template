import { AdminSuppliers } from "@/components/admin/admin-suppliers"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminSuppliers key={id} initialSupplierId={id} />
}
