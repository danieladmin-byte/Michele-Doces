import type { BaseUnit, PurchaseUnit } from '../types'
import { FAMILY_UNITS, UNIT_LABEL } from '../lib/format'

type Props = {
  base: BaseUnit
  value: string
  unit: PurchaseUnit
  onValue: (v: string) => void
  onUnit: (u: PurchaseUnit) => void
  label?: string
  placeholder?: string
  id?: string
}

/** Campo de quantidade com seletor de unidade (kg/g, L/ml, un). */
export function UnitQty({ base, value, unit, onValue, onUnit, label, placeholder, id }: Props) {
  const options = FAMILY_UNITS[base]
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="unit-qty">
        <input
          id={id}
          inputMode="decimal"
          value={value}
          placeholder={placeholder ?? '0'}
          onChange={(e) => onValue(e.target.value)}
        />
        {options.length > 1 ? (
          <select value={unit} onChange={(e) => onUnit(e.target.value as PurchaseUnit)} aria-label="Unidade">
            {options.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        ) : (
          <span className="unit-fixed">{UNIT_LABEL[options[0]]}</span>
        )}
      </div>
    </div>
  )
}
