import {
  BookOpen,
  BriefcaseBusiness,
  Coffee,
  Printer,
  ShoppingBag,
  Store,
  type LucideIcon,
} from 'lucide-react'

export type SupplierTone =
  | 'toneBlue'
  | 'toneCoral'
  | 'toneGold'
  | 'toneMauve'

interface SupplierPresentation {
  Icon: LucideIcon
  tone: SupplierTone
}

/** Maps real Supplier categories to the shared visual language without inventing domain data. */
export function supplierPresentation(
  type: string | null | undefined,
): SupplierPresentation {
  const category = type?.toLowerCase() ?? ''

  if (category.includes('food') || category.includes('coffee')) {
    return { Icon: Coffee, tone: 'toneCoral' }
  }
  if (category.includes('print')) {
    return { Icon: Printer, tone: 'toneBlue' }
  }
  if (category.includes('shop')) {
    return { Icon: ShoppingBag, tone: 'toneGold' }
  }
  if (category.includes('book') || category.includes('library')) {
    return { Icon: BookOpen, tone: 'toneMauve' }
  }
  if (category.includes('service')) {
    return { Icon: BriefcaseBusiness, tone: 'toneBlue' }
  }

  return { Icon: Store, tone: 'toneBlue' }
}
