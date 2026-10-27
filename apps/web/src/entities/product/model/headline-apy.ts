import { compareRate, type Product, type Rate } from '@fa/contracts';

/** The highest tier APY: what a product advertises before tiers and taxes. The schema
 * guarantees at least one tier. */
export const headlineApy = (product: Pick<Product, 'tiers'>): Rate =>
  product.tiers.reduce((best, t) => (compareRate(t.apy, best.apy) > 0 ? t : best)).apy;
