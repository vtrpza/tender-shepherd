export const MODULES = {
  trafego: {
    name: 'Agente de Tráfego Autônomo',
    tagline: 'Meta Ads + Google Ads no piloto automático',
    number: '01',
    priceEnvKey: 'STRIPE_PRICE_TRAFEGO',
    displayPrice: 'R$97',
  },
  vendas: {
    name: 'Agente de Vendas & CRM',
    tagline: 'HubSpot + Pipedrive gerenciados por IA',
    number: '02',
    priceEnvKey: 'STRIPE_PRICE_VENDAS',
    displayPrice: 'R$97',
  },
  financeiro: {
    name: 'Agente Financeiro Inteligente',
    tagline: 'Extratos, DRE e alertas automáticos',
    number: '03',
    priceEnvKey: 'STRIPE_PRICE_FINANCEIRO',
    displayPrice: 'R$97',
  },
} as const;

export type ModuleSlug = keyof typeof MODULES;

export const MODULE_SLUGS = Object.keys(MODULES) as ModuleSlug[];

export function isValidSlug(slug: string): slug is ModuleSlug {
  return slug in MODULES;
}
