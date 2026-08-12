// Funding buckets in paise
export const FUNDING_BUCKETS: Record<string, { label: string; min?: number; max?: number }> = {
  "under-5k": { label: "Under ₹5,000", max: 500000 },
  "5k-10k": { label: "₹5,000–₹10,000", min: 500000, max: 1000000 },
  "10k-25k": { label: "₹10,000–₹25,000", min: 1000000, max: 2500000 },
  "25k-50k": { label: "₹25,000–₹50,000", min: 2500000, max: 5000000 },
  "50k-plus": { label: "₹50,000+", min: 5000000 },
};
