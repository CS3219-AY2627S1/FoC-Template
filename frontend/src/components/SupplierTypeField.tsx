/**
 * AI Assistance Disclosure
 * Tool: Cursor (Composer)
 * Scope: Controlled supplier type Select with Other + custom free-text value.
 * Author review: Reviewed against Create/Edit validation and VARCHAR(100) limit.
 */

import { useEffect, useState } from 'react'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import {
  SUPPLIER_TYPE_CATEGORIES,
  SUPPLIER_TYPE_MAX_LENGTH,
  SUPPLIER_TYPE_OTHER,
  getSupplierTypeError,
  isControlledSupplierType,
} from '../suppliers/supplierTypes'

type SupplierTypeFieldProps = {
  value: string
  onChange: (value: string) => void
  error?: boolean
}

function SupplierTypeField({
  value,
  onChange,
  error = false,
}: SupplierTypeFieldProps) {
  const [choseOther, setChoseOther] = useState(
    () => value !== '' && !isControlledSupplierType(value),
  )

  useEffect(() => {
    if (isControlledSupplierType(value)) {
      setChoseOther(false)
      return
    }
    if (value !== '') {
      setChoseOther(true)
    }
  }, [value])

  const usingOther = choseOther || (value !== '' && !isControlledSupplierType(value))
  const selectValue = usingOther ? SUPPLIER_TYPE_OTHER : value
  const helperText = error
    ? getSupplierTypeError(value)
    : usingOther
      ? 'Enter a custom type'
      : 'Choose a category, or Other for a custom type'

  return (
    <Stack spacing={1.5}>
      <FormControl required fullWidth error={Boolean(error && !usingOther)}>
        <InputLabel id="supplier-type-category-label">Type</InputLabel>
        <Select
          labelId="supplier-type-category-label"
          label="Type"
          value={selectValue}
          onChange={(event) => {
            const next = event.target.value
            if (next === SUPPLIER_TYPE_OTHER) {
              setChoseOther(true)
              if (isControlledSupplierType(value) || value === '') {
                onChange('')
              }
              return
            }
            setChoseOther(false)
            onChange(next)
          }}
        >
          {SUPPLIER_TYPE_CATEGORIES.map((category) => (
            <MenuItem key={category} value={category}>
              {category}
            </MenuItem>
          ))}
          <MenuItem value={SUPPLIER_TYPE_OTHER}>{SUPPLIER_TYPE_OTHER}</MenuItem>
        </Select>
        {!usingOther && <FormHelperText>{helperText}</FormHelperText>}
      </FormControl>

      {usingOther ? (
        <TextField
          required
          label="Custom type"
          value={isControlledSupplierType(value) ? '' : value}
          onChange={(event) => onChange(event.target.value)}
          error={error}
          helperText={helperText}
          slotProps={{
            htmlInput: { maxLength: SUPPLIER_TYPE_MAX_LENGTH },
          }}
        />
      ) : null}
    </Stack>
  )
}

export default SupplierTypeField
