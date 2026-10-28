// HTTP gateway placeholder for stage 2 (ADR-005): every method rejects with `not_implemented`.
import { GatewayError, type DataGateway } from '@fa/contracts';

const notImplemented = (method: keyof DataGateway) => (): Promise<never> =>
  Promise.reject(new GatewayError('not_implemented', `${method} is not implemented yet`, false));

export const httpGateway: DataGateway = {
  listInstitutions: notImplemented('listInstitutions'),
  getInstitution: notImplemented('getInstitution'),
  getBankMetrics: notImplemented('getBankMetrics'),
  listProducts: notImplemented('listProducts'),
  getProduct: notImplemented('getProduct'),
  getDocument: notImplemented('getDocument'),
  listFacts: notImplemented('listFacts'),
  getTaxTables: notImplemented('getTaxTables'),
  getInsuranceRules: notImplemented('getInsuranceRules'),
  listSources: notImplemented('listSources'),
  listSponsored: notImplemented('listSponsored'),
  getDatasetInfo: notImplemented('getDatasetInfo'),
};
