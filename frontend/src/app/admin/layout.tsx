import { AdminGate } from "@/components/admin/admin-mode-provider"
import { RequireAuth } from "@/components/require-auth"

const adminAppearance = [
  "font-sans text-sm font-normal text-foreground",
  "[&_tbody]:font-normal [&_tbody_a]:font-normal [&_tbody_button]:font-normal",
  "[&_[data-slot=badge]]:h-6 [&_[data-slot=badge]]:text-sm [&_[data-slot=badge]]:font-normal",
  "[&_.font-mono]:font-sans [&_.font-mono]:text-sm",
  "[&_.leaflet-container]:font-sans [&_.leaflet-container]:text-sm",
  "[&_.leaflet-popup-content-wrapper]:bg-card [&_.leaflet-popup-content-wrapper]:text-card-foreground",
  "[&_.leaflet-popup-tip]:bg-card [&_.leaflet-popup-content_a]:text-foreground",
].join(" ")

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth><AdminGate>
    <div className={adminAppearance}>
      {children}
    </div>
  </AdminGate></RequireAuth>
}
