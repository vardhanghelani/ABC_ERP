import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n)
}

/** Stock bar fill % — uses reorder level × 3 as visual max capacity */
export function getStockLevelPercent(current: number, reorderLevel: number): number {
  const max = Math.max(reorderLevel * 3, current, 1)
  return Math.min(100, Math.round((current / max) * 100))
}

export function getStockBarColor(percent: number): string {
  if (percent > 60) return 'var(--color-success)'
  if (percent >= 30) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

export function getNetOutstanding(outstandingAmount: number, advanceBalance = 0): number {
  return Math.round((outstandingAmount - advanceBalance) * 100) / 100
}

/** Amount to collect — net outstanding, never below zero. */
export function getAmountDue(outstandingAmount: number, advanceBalance = 0): number {
  return Math.max(0, getNetOutstanding(outstandingAmount, advanceBalance))
}

