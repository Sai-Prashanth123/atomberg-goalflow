// BRD §1 — Alignment context for Thrust Areas.
//
// The BRD problem statement explicitly calls out that "employees lack clarity
// on how their work connects to organizational priorities." A bare enum value
// like `PRODUCT_INNOVATION` doesn't relieve that pain. This file is the single
// source of truth for what each Thrust Area means at the company level — its
// owner, the company KPI it ladders up to, and a few example goal titles so
// first-time employees have an anchor.
//
// This is configuration data, not user data — kept in source for simplicity.
// In production it would live in an admin-managed table updated each FY.

import type { ThrustArea } from "./types";

export interface ThrustContext {
  description: string;
  ownerRole: string;
  companyKpi: string;
  exampleGoals: string[];
}

export const THRUST_CONTEXT: Record<ThrustArea, ThrustContext> = {
  ENERGY_EFFICIENCY: {
    description: "Reduce energy consumption across our product line and operations — the core of Atomberg's brand promise.",
    ownerRole: "VP Engineering",
    companyKpi: "15% reduction in operating power per fan model · FY26",
    exampleGoals: [
      "Lower BLDC fan idle wattage by 20%",
      "Cut factory line energy use by 8%",
      "Ship one product variant under 28W peak",
    ],
  },
  MARKET_EXPANSION: {
    description: "Grow Atomberg's footprint in Tier-2/3 cities, B2B channels, and international markets.",
    ownerRole: "Chief Revenue Officer",
    companyKpi: "Enter 50 new cities + 2 export markets · FY26",
    exampleGoals: [
      "Onboard 200 new dealers in Tier-2 South India",
      "Launch first SKU in UAE retail",
      "Grow B2B/institutional revenue by 30%",
    ],
  },
  PRODUCT_INNOVATION: {
    description: "Ship the next generation of smart, energy-efficient appliances ahead of the competition.",
    ownerRole: "VP Product",
    companyKpi: "Two new SKUs shipped + one platform refresh · FY26",
    exampleGoals: [
      "Launch BLDC Fan v4 with smart controls",
      "Add Matter / Apple Home integration",
      "Reduce BoM cost on flagship by 12%",
    ],
  },
  CUSTOMER_SUCCESS: {
    description: "Make Atomberg owners measurably more loyal — across NPS, support quality, and warranty experience.",
    ownerRole: "VP Customer Experience",
    companyKpi: "NPS 62 → 72 · TAT 18h → 10h · FY26",
    exampleGoals: [
      "Improve NPS from 62 to 72",
      "Reduce mean support TAT below 10 hours",
      "Auto-resolve 40% of warranty queries",
    ],
  },
  OPERATIONAL_EXCELLENCE: {
    description: "Quality, safety, and on-time delivery — the foundations that make everything else possible.",
    ownerRole: "COO",
    companyKpi: "Zero critical production incidents · OTIF 95% · FY26",
    exampleGoals: [
      "Zero critical production incidents",
      "Lift OTIF (On-Time-In-Full) from 88% to 95%",
      "Reduce returns/100 units by 30%",
    ],
  },
};
