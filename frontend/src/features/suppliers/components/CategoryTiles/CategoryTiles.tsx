import { Link } from '@tanstack/react-router'
import {
  Coffee,
  Package,
  Printer,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SUPPLIER_CATEGORIES } from '../../types/supplier.types'
import type { SupplierCategory } from '../../types/supplier.types'
import { categoryLabels } from '../../utils/supplierFormat'
import styles from './CategoryTiles.module.scss'

const categoryArt: Record<
  SupplierCategory,
  { Icon: LucideIcon; tone: string }
> = {
  FOOD: { Icon: UtensilsCrossed, tone: 'orange' },
  COFFEE: { Icon: Coffee, tone: 'blue' },
  SHOPPING: { Icon: ShoppingBag, tone: 'purple' },
  PRINTING: { Icon: Printer, tone: 'navy' },
  OTHER: { Icon: Package, tone: 'green' },
}

export const CategoryTiles = () => (
  <ul className={styles.categories} aria-label="Supplier categories">
    {SUPPLIER_CATEGORIES.map((category) => {
      const { Icon, tone } = categoryArt[category]
      return (
        <li key={category}>
          <Link
            to="/locations"
            search={{ category }}
            className={styles.category}
          >
            <span className={styles.tile} data-tone={tone} aria-hidden="true">
              <Icon size={28} strokeWidth={1.9} />
            </span>
            <span>{categoryLabels[category]}</span>
          </Link>
        </li>
      )
    })}
  </ul>
)
