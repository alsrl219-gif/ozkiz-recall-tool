import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { cloudStorage } from './cloudStorage'

// Supabase 기반 공유 스토리지 (모든 사용자가 동일한 데이터 공유)
const sharedStorage = createJSONStorage(() => cloudStorage)
import type {
  Product,
  Store,
  CenterStock,
  StoreStock,
  SaleRecord,
  PeriodSaleAggregate,
  RecallItem,
  AppSettings,
  UploadSession,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { generateRecommendations } from '../utils/analysis'
import { generateId } from '../utils/helpers'

interface AppState {
  // 마스터 데이터
  products: Product[]
  stores: Store[]
  centerStocks: CenterStock[]
  storeStocks: StoreStock[]
  sales: SaleRecord[]
  periodSales: PeriodSaleAggregate[]   // 기간합계 판매 (이지어드민 통계, 쿠팡)
  barcodeMap: Record<string, string>   // { 바코드: 상품코드 }
  recallItems: RecallItem[]
  uploadSessions: UploadSession[]
  settings: AppSettings

  // 액션: 데이터 설정
  setProducts: (products: Product[]) => void
  addProducts: (products: Product[]) => void
  setStores: (stores: Store[]) => void
  addStores: (stores: Store[]) => void
  setCenterStocks: (stocks: CenterStock[]) => void
  setStoreStocks: (stocks: StoreStock[]) => void
  addSales: (sales: SaleRecord[]) => void
  clearSalesByChannel: (channel: 'online' | 'offline' | 'coupang') => void
  setPeriodSales: (sales: PeriodSaleAggregate[], channel: 'online' | 'offline' | 'coupang') => void
  addPeriodSales: (sales: PeriodSaleAggregate[]) => void
  setBarcodeMap: (map: Record<string, string>) => void
  addUploadSession: (session: UploadSession) => void

  // 액션: 회수 관리
  generateRecalls: () => void
  updateRecallItem: (id: string, updates: Partial<RecallItem>) => void
  requestRecall: (recId: string, requestedQty: number, note?: string) => void
  updateRecallStatus: (id: string, status: RecallItem['status'], actualQty?: number) => void
  deleteRecallItem: (id: string) => void

  // 액션: 설정
  updateSettings: (settings: Partial<AppSettings>) => void

  // 유틸
  getProduct: (id: string) => Product | undefined
  getStore: (id: string) => Store | undefined
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      products: [],
      stores: [],
      centerStocks: [],
      storeStocks: [],
      sales: [],
      periodSales: [],
      barcodeMap: {},
      recallItems: [],
      uploadSessions: [],
      settings: DEFAULT_SETTINGS,

      setProducts: (products) => set({ products }),
      addProducts: (newProds) =>
        set((s) => {
          const map = new Map(s.products.map((p) => [p.id, p]))
          newProds.forEach((p) => map.set(p.id, p))
          return { products: [...map.values()] }
        }),

      setStores: (stores) => set({ stores }),
      addStores: (newStores) =>
        set((s) => {
          const map = new Map(s.stores.map((st) => [st.id, st]))
          newStores.forEach((st) => map.set(st.id, st))
          return { stores: [...map.values()] }
        }),

      setCenterStocks: (centerStocks) => set({ centerStocks }),

      setStoreStocks: (storeStocks) => set({ storeStocks }),

      addSales: (newSales) =>
        set((s) => ({
          sales: [...s.sales, ...newSales],
        })),

      clearSalesByChannel: (channel) =>
        set((s) => ({
          sales: s.sales.filter((r) => r.channel !== channel),
          periodSales: s.periodSales.filter((r) => r.channel !== channel),
        })),

      setPeriodSales: (sales, channel) =>
        set((s) => ({
          periodSales: [
            ...s.periodSales.filter((r) => r.channel !== channel),
            ...sales,
          ],
        })),

      addPeriodSales: (newSales) =>
        set((s) => ({ periodSales: [...s.periodSales, ...newSales] })),

      setBarcodeMap: (incoming) =>
        set((s) => ({ barcodeMap: { ...s.barcodeMap, ...incoming } })),

      addUploadSession: (session) =>
        set((s) => ({ uploadSessions: [session, ...s.uploadSessions] })),

      generateRecalls: () => {
        const { sales, periodSales, centerStocks, storeStocks, settings, recallItems } = get()
        const recommendations = generateRecommendations({
          sales,
          periodSales,
          centerStocks,
          storeStocks,
          settings,
        })

        // 기존 'recommended' 상태 항목만 교체 (요청된 것은 유지)
        const existingActive = recallItems.filter((r) => r.status !== 'recommended')

        const newItems: RecallItem[] = recommendations.map((rec) => {
          // 이미 활성 회수가 있으면 스킵
          const existing = existingActive.find(
            (r) => r.productId === rec.productId && r.storeId === rec.storeId
          )
          if (existing) return existing

          return {
            id: generateId(),
            productId: rec.productId,
            storeId: rec.storeId,
            priority: rec.priority,
            recallScore: rec.recallScore,
            suggestedQty: rec.suggestedQty,
            status: 'recommended',
            reason: rec.reason,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        })

        set({ recallItems: [...existingActive, ...newItems] })
      },

      updateRecallItem: (id, updates) =>
        set((s) => ({
          recallItems: s.recallItems.map((r) =>
            r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
          ),
        })),

      requestRecall: (recId, requestedQty, note) =>
        set((s) => ({
          recallItems: s.recallItems.map((r) =>
            r.id === recId
              ? {
                  ...r,
                  requestedQty,
                  note,
                  status: 'requested' as const,
                  updatedAt: new Date().toISOString(),
                }
              : r
          ),
        })),

      updateRecallStatus: (id, status, actualQty) =>
        set((s) => ({
          recallItems: s.recallItems.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status,
                  actualQty: actualQty ?? r.actualQty,
                  completedAt:
                    status === 'received' ? new Date().toISOString() : r.completedAt,
                  updatedAt: new Date().toISOString(),
                }
              : r
          ),
        })),

      deleteRecallItem: (id) =>
        set((s) => ({ recallItems: s.recallItems.filter((r) => r.id !== id) })),

      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      getProduct: (id) => get().products.find((p) => p.id === id),
      getStore: (id) => get().stores.find((s) => s.id === id),
    }),
    {
      name: 'ozkiz-rt-storage',
      storage: sharedStorage,
      // Supabase에 전체 상태 저장 → 모든 사용자 공유
      partialize: (s) => ({
        products: s.products,
        stores: s.stores,
        centerStocks: s.centerStocks,
        storeStocks: s.storeStocks,
        sales: s.sales,
        periodSales: s.periodSales,
        barcodeMap: s.barcodeMap,
        recallItems: s.recallItems,
        uploadSessions: s.uploadSessions,
        settings: s.settings,
      }),
    }
  )
)
