"use client"

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Icons } from "./icons"

// ─── LOGO ───
export function ElevateLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-7 h-7 text-sm rounded-lg", md: "w-9 h-9 text-lg rounded-[10px]", lg: "w-12 h-12 text-xl rounded-[14px]" }
  const text = { sm: "text-[15px]", md: "text-xl", lg: "text-2xl" }
  return (
    <div className="flex items-center gap-3">
      <div className={cn("bg-abricot flex items-center justify-center font-serif font-black text-navy", sizes[size])}>
        {"E"}
      </div>
      <span className={cn("font-serif font-bold text-current", text[size])}>Elevate</span>
    </div>
  )
}

// ─── ELEVATE BUTTON ───
type ButtonVariant = "primary" | "secondary" | "violet" | "watermelon" | "outline" | "outlineViolet" | "ghost"
type ButtonSize = "sm" | "md" | "lg"

interface ElevateButtonProps {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: boolean
  fullWidth?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: "button" | "submit"
  className?: string
}

export function ElevateButton({
  children, variant = "primary", size = "md", icon, iconRight = false,
  fullWidth = false, disabled = false, onClick, type = "button", className
}: ElevateButtonProps) {
  const variantStyles: Record<ButtonVariant, string> = {
    primary: "bg-navy text-white hover:bg-navy-mid",
    secondary: "bg-abricot text-navy hover:bg-abricot-dark",
    violet: "bg-violet text-white hover:bg-[#644A8C]",
    watermelon: "bg-watermelon text-white hover:bg-watermelon-dark",
    outline: "bg-transparent text-navy border-2 border-navy hover:bg-gray-light",
    outlineViolet: "bg-transparent text-violet border-2 border-violet hover:bg-violet-pale",
    ghost: "bg-transparent text-navy border-2 border-transparent hover:bg-gray-light",
  }
  const sizeStyles: Record<ButtonSize, string> = {
    sm: "px-4 py-2 text-[13px] gap-1.5 rounded-lg",
    md: "px-[22px] py-3 text-[15px] gap-2 rounded-[10px]",
    lg: "px-7 py-4 text-base gap-2.5 rounded-xl",
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center font-sans font-semibold tracking-[0.01em] transition-all duration-200 cursor-pointer",
        "hover:-translate-y-px hover:shadow-md",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-mid disabled:text-text-light disabled:border-gray-mid disabled:hover:translate-y-0 disabled:hover:shadow-none",
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && "w-full",
        iconRight && "flex-row-reverse",
        className,
      )}
    >
      {icon && <span className="flex items-center">{icon}</span>}
      {children}
    </button>
  )
}

// ─── INPUT FIELD ───
interface InputFieldProps {
  label?: string
  placeholder?: string
  icon?: ReactNode
  type?: string
  error?: string
  helper?: string
  value?: string
  onChange?: (val: string) => void
  className?: string
}

export function InputField({ label, placeholder, icon, type = "text", error, helper, value, onChange, className }: InputFieldProps) {
  const [focused, setFocused] = useState(false)
  const [internalValue, setInternalValue] = useState("")
  const val = value ?? internalValue
  const handleChange = (v: string) => {
    if (onChange) onChange(v)
    else setInternalValue(v)
  }

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label className="block font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">{label}</label>
      )}
      <div className={cn(
        "flex items-center gap-2.5 px-3.5 py-3 bg-card border-2 rounded-[10px] transition-all duration-200",
        error ? "border-watermelon" : focused ? "border-navy shadow-[0_0_0_3px_rgba(27,42,74,0.09)]" : "border-gray-mid",
      )}>
        {icon && <span className={cn("flex transition-colors duration-200", focused ? "text-navy" : "text-text-light")}>{icon}</span>}
        <input
          type={type}
          placeholder={placeholder}
          value={val}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 border-none outline-none font-sans text-[15px] text-text-dark bg-transparent placeholder:text-text-light"
        />
      </div>
      {(error || helper) && (
        <p className={cn("font-sans text-xs mt-1.5", error ? "text-watermelon" : "text-text-light")}>{error || helper}</p>
      )}
    </div>
  )
}

// ─── PROGRESS BAR ───
interface ProgressBarProps {
  value: number
  max?: number
  color?: string
  label?: string
  sublabel?: string
}

export function ProgressBar({ value, max = 100, label, sublabel, color = "bg-violet" }: ProgressBarProps) {
  const pct = Math.round((value / max) * 100)
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        {label && <span className="font-sans text-[13px] font-semibold text-text-dark">{label}</span>}
        {sublabel && <span className="font-sans text-xs text-text-light">{sublabel}</span>}
      </div>
      <div className="h-2 bg-gray-light rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── STAT CARD ───
interface StatCardProps {
  icon: ReactNode
  label: string
  value: string
  accentBg: string
  accentText: string
}

export function StatCard({ icon, label, value, accentBg, accentText }: StatCardProps) {
  return (
    <div className="p-5 bg-card rounded-2xl border border-gray-mid flex items-center gap-3.5">
      <div className={cn("w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0", accentBg, accentText)}>
        {icon}
      </div>
      <div>
        <div className="font-sans text-xs text-text-light mb-0.5">{label}</div>
        <div className="font-serif text-[22px] font-bold text-navy">{value}</div>
      </div>
    </div>
  )
}

// ─── LEVEL BADGE ───
interface LevelBadgeProps {
  level: string
  colorClass: string
  active?: boolean
}

export function LevelBadge({ level, colorClass, active = false }: LevelBadgeProps) {
  const colorMap: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
    violet: { bg: "bg-violet/10", text: "text-violet", border: "border-violet", activeBg: "bg-violet" },
    abricot: { bg: "bg-abricot/10", text: "text-abricot-dark", border: "border-abricot", activeBg: "bg-abricot" },
    watermelon: { bg: "bg-watermelon/10", text: "text-watermelon", border: "border-watermelon", activeBg: "bg-watermelon" },
    navy: { bg: "bg-navy/10", text: "text-navy", border: "border-navy", activeBg: "bg-navy" },
  }
  const c = colorMap[colorClass] || colorMap.violet
  return (
    <div className={cn(
      "px-3.5 py-1.5 rounded-lg font-sans text-[13px] font-bold tracking-[0.05em] border-2 transition-all",
      c.border,
      active ? cn(c.activeBg, "text-white") : cn(c.bg, c.text),
    )}>
      {level}
    </div>
  )
}

// ─── BADGE CHOOSER ───
interface BadgeOption {
  value: string
  label: string
  emoji?: string
  icon?: ReactNode
}

interface BadgeChooserProps {
  options: BadgeOption[]
  selected: string | string[]
  onSelect: (val: string | string[]) => void
  multi?: boolean
}

export function BadgeChooser({ options, selected, onSelect, multi = false }: BadgeChooserProps) {
  const isSelected = (val: string) => multi ? (Array.isArray(selected) ? selected.includes(val) : false) : selected === val
  const handleClick = (val: string) => {
    if (multi) {
      const arr = Array.isArray(selected) ? selected : []
      onSelect(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
    } else {
      onSelect(val)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = isSelected(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleClick(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-[13px] font-medium cursor-pointer border-2 transition-all duration-200 tracking-[0.01em]",
              active ? "bg-navy text-white border-navy" : "bg-card text-text-dark border-gray-mid hover:border-navy/30",
            )}
          >
            {opt.icon && <span className="flex">{opt.icon}</span>}
            {opt.emoji && <span>{opt.emoji}</span>}
            {opt.label}
            {active && <Icons.Check />}
          </button>
        )
      })}
    </div>
  )
}

// ─── LESSON CARD ───
interface LessonCardProps {
  title: string
  desc: string
  progress: number
  level: string
  levelColor: string
  time: string
  tag?: string
}

export function LessonCard({ title, desc, progress, level, levelColor, time, tag }: LessonCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3 transition-shadow hover:shadow-md">
      <div className="flex justify-between items-center">
        <LevelBadge level={level} colorClass={levelColor} />
        <span className="flex items-center gap-1 font-sans text-xs text-text-light">
          <Icons.Clock /> {time}
        </span>
      </div>
      <div>
        <h4 className="font-serif text-base font-bold text-navy mb-1">{title}</h4>
        <p className="font-sans text-[13px] text-text-mid leading-relaxed">{desc}</p>
      </div>
      <ProgressBar value={progress} sublabel={`${progress}%`} color={
        levelColor === "abricot" ? "bg-abricot" :
        levelColor === "watermelon" ? "bg-watermelon" :
        levelColor === "navy" ? "bg-navy" : "bg-violet"
      } />
      {tag && (
        <span className="self-start px-2.5 py-1 rounded-md bg-abricot/15 text-abricot-dark font-sans text-[11px] font-semibold">
          {tag}
        </span>
      )}
    </div>
  )
}

// ─── RADIO CARD CHOOSER ───
interface RadioCardOption {
  value: string
  label: string
  emoji?: string
  icon?: ReactNode
  desc?: string
}

interface RadioCardChooserProps {
  options: RadioCardOption[]
  selected: string
  onSelect: (val: string) => void
  columns?: number
}

export function RadioCardChooser({ options, selected, onSelect, columns = 3 }: RadioCardChooserProps) {
  const gridCols: Record<number, string> = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
    6: "grid-cols-3 md:grid-cols-6",
  }

  return (
    <div className={cn("grid gap-3", gridCols[columns] || "grid-cols-3")}>
      {options.map((opt) => {
        const active = selected === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className={cn(
              "flex flex-col items-center gap-2 p-5 rounded-[14px] cursor-pointer border-2 transition-all duration-200 relative overflow-hidden",
              active ? "bg-navy/5 border-navy" : "bg-card border-gray-mid hover:border-navy/30",
            )}
          >
            {active && (
              <div className="absolute top-2 right-2 w-[22px] h-[22px] rounded-full bg-navy flex items-center justify-center text-white">
                <Icons.Check />
              </div>
            )}
            {opt.icon && (
              <div className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all",
                active ? "bg-navy text-white" : "bg-gray-light text-navy",
              )}>{opt.icon}</div>
            )}
            {opt.emoji && <span className="text-[28px]">{opt.emoji}</span>}
            <span className={cn("font-sans text-sm font-semibold", active ? "text-navy" : "text-text-dark")}>{opt.label}</span>
            {opt.desc && <span className="font-sans text-xs text-text-light text-center leading-snug">{opt.desc}</span>}
          </button>
        )
      })}
    </div>
  )
}
